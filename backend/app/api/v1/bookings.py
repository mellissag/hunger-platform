"""Бронирования."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, require_roles
from app.models.enums import UserRole
from app.models.salon import Salon
from app.models.user import User
from app.schemas.booking import (
    BookingCancel,
    BookingCreate,
    BookingDetailOut,
    BookingOut,
    BookingRejectBody,
    BookingReschedule,
    BookingStatsOut,
    BookingUpdate,
)
from app.schemas.common import PaginatedResponse
from app.services import booking_service
from app.services.booking_service import confirm_booking, reject_booking
from app.services.broadcast_service import (
    enqueue_post_visit_trigger_job,
    get_active_post_visit_trigger,
)
from app.schemas.booking import BookingRejectBody
from app.services.notification_service import AdminEvent, get_admin_notify_chat_id, notify_admin
from app.services.notifications import (
    notify_client_booking_confirmed,
    notify_client_booking_rejected,
    notify_master_booking_cancelled,
    notify_master_booking_status_changed,
    notify_master_booking_updated,
    notify_master_new_booking,
)

router = APIRouter(prefix="/bookings", tags=["bookings"])

STAFF = (UserRole.owner, UserRole.admin, UserRole.reception, UserRole.master)


async def _salon_timezone(db: AsyncSession) -> str:
    row = (await db.execute(select(Salon).limit(1))).scalar_one_or_none()
    return row.timezone if row is not None else "Europe/Sofia"


@router.get("/stats", response_model=BookingStatsOut)
async def booking_stats(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*STAFF))],
) -> BookingStatsOut:
    tz = await _salon_timezone(db)
    return await booking_service.booking_stats(db, user, timezone_name=tz)


@router.get("", response_model=PaginatedResponse[BookingOut])
async def list_bookings(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*STAFF))],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="limit"),
    q: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    master_id: UUID | None = None,
    service_id: UUID | None = None,
    status: str | None = None,
    needs_consultation: bool | None = None,
) -> PaginatedResponse[BookingOut]:
    rows, total = await booking_service.list_bookings(
        db,
        user,
        q=q,
        page=page,
        page_size=page_size,
        date_from=date_from,
        date_to=date_to,
        master_id=master_id,
        service_id=service_id,
        status=status,
        needs_consultation=needs_consultation,
    )
    return PaginatedResponse(
        items=[BookingOut.model_validate(b) for b in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/{booking_id}/cancel", response_model=BookingOut)
async def cancel_booking(
    booking_id: UUID,
    body: BookingCancel,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*STAFF))],
) -> BookingOut:
    b = await booking_service.cancel_booking(
        db, user, booking_id, actor=body.actor, reason=body.reason
    )
    await notify_master_booking_cancelled(booking_id, getattr(request.app.state, "bot", None), db)
    return BookingOut.model_validate(b)


@router.post("/{booking_id}/reschedule", response_model=BookingOut)
async def reschedule_booking(
    booking_id: UUID,
    body: BookingReschedule,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*STAFF))],
) -> BookingOut:
    b = await booking_service.reschedule_booking(db, user, booking_id, body.starts_at)
    await notify_master_booking_updated(booking_id, getattr(request.app.state, "bot", None), db)
    return BookingOut.model_validate(b)


@router.post("/{booking_id}/complete", response_model=BookingOut)
async def complete_booking(
    booking_id: UUID,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*STAFF))],
) -> BookingOut:
    b = await booking_service.mark_completed(db, user, booking_id)
    trigger = await get_active_post_visit_trigger(db, b.master_id)
    if trigger is not None:
        await enqueue_post_visit_trigger_job(b.id, trigger.delay_hours)
    await notify_master_booking_status_changed(
        booking_id,
        getattr(request.app.state, "bot", None),
        db,
        status_label="завершена",
    )
    return BookingOut.model_validate(b)


@router.post("/{booking_id}/no-show", response_model=BookingOut)
async def no_show_booking(
    booking_id: UUID,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*STAFF))],
) -> BookingOut:
    b = await booking_service.mark_no_show(db, user, booking_id)
    await notify_master_booking_status_changed(
        booking_id,
        getattr(request.app.state, "bot", None),
        db,
        status_label="клиент не пришёл",
    )
    return BookingOut.model_validate(b)


@router.post("/{booking_id}/confirm", response_model=BookingOut)
async def confirm_booking_endpoint(
    booking_id: UUID,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*STAFF))],
) -> BookingOut:
    from app.core.exceptions import InvalidBookingStateError, NotFoundError

    try:
        b = await confirm_booking(db, user, booking_id)
        await db.commit()
        await db.refresh(b)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=e.message) from e
    except InvalidBookingStateError as e:
        raise HTTPException(status_code=400, detail=e.message) from e
    await notify_client_booking_confirmed(b.id, getattr(request.app.state, "bot", None), db)
    return BookingOut.model_validate(b)


@router.post("/{booking_id}/reject", response_model=BookingOut)
async def reject_booking_endpoint(
    booking_id: UUID,
    body: BookingRejectBody,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*STAFF))],
) -> BookingOut:
    from app.core.exceptions import InvalidBookingStateError, NotFoundError

    try:
        b = await reject_booking(db, user, booking_id, reason=body.reason)
        await db.commit()
        await db.refresh(b)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=e.message) from e
    except InvalidBookingStateError as e:
        raise HTTPException(status_code=400, detail=e.message) from e
    await notify_client_booking_rejected(b.id, getattr(request.app.state, "bot", None), db, reason=body.reason)
    return BookingOut.model_validate(b)


@router.get("/{booking_id}", response_model=BookingDetailOut)
async def get_booking(
    booking_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*STAFF))],
) -> BookingDetailOut:
    return await booking_service.get_booking_detail(db, user, booking_id)


@router.post("", response_model=BookingOut)
async def create_booking(
    body: BookingCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*STAFF))],
) -> BookingOut:
    b = await booking_service.create_booking(db, user, body)
    bot = getattr(request.app.state, "bot", None)
    await notify_master_new_booking(b.id, bot, db)
    admin_chat_id = await get_admin_notify_chat_id(db)
    if admin_chat_id:
        from app.config import get_settings
        from app.models.master import Master
        from app.models.service import Service
        cfg = get_settings()
        m = await db.get(Master, b.master_id) if b.master_id else None
        svc = await db.get(Service, b.service_id)
        await notify_admin(
            bot,
            admin_chat_id=admin_chat_id,
            event=AdminEvent.new_booking,
            app_domain=cfg.app_domain,
            client=b.client_name or "—",
            master=m.display_name if m else "—",
            service=svc.name if svc else "—",
            date=b.starts_at.strftime("%Y-%m-%d %H:%M") if b.starts_at else "—",
        )
    return BookingOut.model_validate(b)


@router.patch("/{booking_id}", response_model=BookingOut)
async def update_booking(
    booking_id: UUID,
    body: BookingUpdate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*STAFF))],
) -> BookingOut:
    b = await booking_service.update_booking(db, user, booking_id, body)
    # Уведомление только при изменении времени записи
    if body.starts_at is not None:
        await notify_master_booking_updated(booking_id, getattr(request.app.state, "bot", None), db)
    return BookingOut.model_validate(b)


@router.delete("/{booking_id}", status_code=204)
async def delete_booking(
    booking_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*STAFF))],
) -> None:
    await booking_service.delete_booking(db, user, booking_id)
