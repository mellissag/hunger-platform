"""CRUD мастеров и Phase 20."""

from __future__ import annotations

import os
from calendar import monthrange
from datetime import UTC, date, datetime, time
from typing import Annotated
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import app.core.clock as clock
from app.core.exceptions import ConflictError
from app.core.exceptions import NotFoundError
from app.core.security import hash_password
from app.core.scope import ensure_master_own_master_id
from app.deps import get_db, require_roles
from app.models.booking import Booking, Review
from app.models.catalog import MasterService, Service
from app.models.enums import BookingStatus, SlotType, UserRole
from app.models.master import Master
from app.models.salon import Salon
from app.models.schedule import ScheduleSlot
from app.models.user import User
from app.schemas.booking import BookingOut
from app.schemas.common import PaginatedResponse
from app.schemas.master import (
    ManualBookingCreate,
    MasterCreate,
    MasterCredentialsUpdate,
    MasterOut,
    MasterServiceRowOut,
    MasterServicesPutResponse,
    MasterServiceUpdate,
    MasterStatsOut,
    MastersTodayStatsOut,
    MasterUpdate,
    PasswordResetData,
    PhotoUrlOut,
    PortfolioListOut,
    ReviewCreate,
    ReviewOut,
    ReviewsPageOut,
    WorkingHoursSchema,
)
from app.schemas.schedule import (
    CalendarBookingOut,
    CalendarResponse,
    CalendarSlotOut,
    MasterScheduleBlockCreate,
    ScheduleBlockOut,
)
from app.services import master_phase20, master_service, schedule_service
from app.services.master_service import master_to_out

router = APIRouter(prefix="/masters", tags=["masters"])

READ_STAFF = (UserRole.owner, UserRole.admin, UserRole.reception, UserRole.master)
WRITE_STAFF = (UserRole.owner, UserRole.admin)
OWNER_ONLY = (UserRole.owner,)


def _locale() -> str:
    return "ru"


async def _salon_tz(db: AsyncSession) -> str:
    row = (await db.execute(select(Salon).limit(1))).scalar_one_or_none()
    return row.timezone if row is not None else "Europe/Sofia"


@router.get("/stats/today", response_model=MastersTodayStatsOut)
async def masters_stats_today(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*READ_STAFF))],
) -> MastersTodayStatsOut:
    return await master_phase20.masters_today_stats(db, user)


@router.get("", response_model=PaginatedResponse[MasterOut])
async def list_masters(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*READ_STAFF))],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    q: str | None = None,
    service_id: UUID | None = Query(None, description="Только мастера, предлагающие услугу"),
) -> PaginatedResponse[MasterOut]:
    rows, total = await master_service.list_masters(
        db, user, q=q, page=page, page_size=page_size, service_id=service_id
    )
    loc = _locale()
    return PaginatedResponse(
        items=[master_to_out(m, locale=loc) for m in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{master_id}", response_model=MasterOut)
async def get_master(
    master_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*READ_STAFF))],
) -> MasterOut:
    m = await master_service.get_master(db, user, master_id)
    return master_to_out(m, locale=_locale())


@router.post("", response_model=MasterOut, status_code=201)
async def create_master(
    body: MasterCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*WRITE_STAFF))],
) -> MasterOut:
    m = await master_service.create_master(db, user, body)
    return master_to_out(m, locale=_locale())


@router.patch("/{master_id}", response_model=MasterOut)
async def update_master(
    master_id: UUID,
    body: MasterUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.owner, UserRole.admin, UserRole.master))],
) -> MasterOut:
    m = await master_service.update_master(db, user, master_id, body)
    return master_to_out(m, locale=_locale())


@router.patch("/{master_id}/credentials", response_model=dict[str, bool | str])
async def update_master_credentials(
    master_id: UUID,
    data: MasterCredentialsUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.owner, UserRole.admin))],
) -> dict[str, bool | str]:
    master = await master_service.get_master(db, user, master_id)
    account = (await db.execute(select(User).where(User.master_id == master.id))).scalar_one_or_none()
    if account is None:
        raise NotFoundError("User for master not found")

    if data.email is None and data.password is None:
        raise ConflictError("No changes provided")

    if data.email is not None:
        email = data.email.strip().lower()
        existing = (await db.execute(select(User.id).where(User.email == email, User.id != account.id))).scalar_one_or_none()
        if existing is not None:
            raise ConflictError("Email already in use")
        account.email = email

    if data.password is not None:
        account.password_hash = hash_password(data.password)

    await db.flush()
    return {"ok": True, "message": "Credentials updated"}


@router.delete("/{master_id}", status_code=204)
async def delete_master(
    master_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*OWNER_ONLY))],
) -> None:
    await master_service.delete_master(db, user, master_id)


@router.post("/{master_id}/photo", response_model=PhotoUrlOut)
async def upload_master_photo(
    master_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.owner, UserRole.admin, UserRole.master))],
    file: UploadFile = File(...),
) -> PhotoUrlOut:
    if user.role == UserRole.master:
        ensure_master_own_master_id(user, master_id)
    raw = await file.read()
    if len(raw) > 8 * 1024 * 1024:
        raise NotFoundError("File too large")
    ext = os.path.splitext(file.filename or "")[1].lower() or ".jpg"
    url = await master_phase20.upload_master_photo(db, master_id, raw, ext)
    return PhotoUrlOut(photo_url=url)


@router.get("/{master_id}/portfolio", response_model=PortfolioListOut)
async def get_portfolio(
    master_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*READ_STAFF))],
) -> PortfolioListOut:
    m = await master_service.get_master(db, user, master_id)
    return PortfolioListOut(items=list(m.portfolio or []))


@router.post("/{master_id}/portfolio", response_model=PortfolioListOut)
async def add_portfolio_photo(
    master_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.owner, UserRole.admin, UserRole.master))],
    file: UploadFile = File(...),
    caption: str | None = Form(None),
) -> PortfolioListOut:
    if user.role == UserRole.master:
        ensure_master_own_master_id(user, master_id)
    raw = await file.read()
    ext = os.path.splitext(file.filename or "")[1].lower() or ".jpg"
    items = await master_phase20.add_portfolio_item(db, master_id, raw, ext, caption)
    return PortfolioListOut(items=items)


@router.delete("/{master_id}/portfolio/{photo_index}", response_model=PortfolioListOut)
async def delete_portfolio_photo(
    master_id: UUID,
    photo_index: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.owner, UserRole.admin, UserRole.master))],
) -> PortfolioListOut:
    if user.role == UserRole.master:
        ensure_master_own_master_id(user, master_id)
    items = await master_phase20.delete_portfolio_item(db, master_id, photo_index)
    return PortfolioListOut(items=items)


@router.get("/{master_id}/working-hours")
async def get_working_hours(
    master_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*READ_STAFF))],
) -> dict:
    m = await master_service.get_master(db, user, master_id)
    return dict(m.working_hours or {})


@router.put("/{master_id}/working-hours")
async def update_working_hours(
    master_id: UUID,
    data: WorkingHoursSchema,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.owner, UserRole.admin, UserRole.master))],
) -> dict:
    if user.role == UserRole.master:
        ensure_master_own_master_id(user, master_id)
    m = await master_service.get_master(db, user, master_id)
    m.working_hours = data.model_dump()
    await db.flush()
    return dict(m.working_hours or {})


@router.get("/{master_id}/services", response_model=list[MasterServiceRowOut])
async def get_master_services(
    master_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*READ_STAFF))],
) -> list[MasterServiceRowOut]:
    await master_service.get_master(db, user, master_id)
    rows = (
        (
            await db.execute(
                select(MasterService, Service).join(Service, Service.id == MasterService.service_id).where(
                    MasterService.master_id == master_id
                )
            )
        )
        .all()
    )
    loc = _locale()
    out: list[MasterServiceRowOut] = []
    for ms, svc in rows:
        ni = svc.name_i18n if isinstance(svc.name_i18n, dict) else {}
        nm = str(ni.get(loc) or ni.get("en") or ni.get("ru") or "—")
        out.append(
            MasterServiceRowOut(
                service_id=ms.service_id,
                price_override=ms.price_override,
                duration_override=ms.duration_override,
                service_name=nm,
            )
        )
    return out


@router.put("/{master_id}/services", response_model=MasterServicesPutResponse)
async def update_master_services(
    master_id: UUID,
    services: list[MasterServiceUpdate],
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*WRITE_STAFF))],
) -> MasterServicesPutResponse:
    rows = [(s.service_id, s.price_override, s.duration_override) for s in services]
    n = await master_phase20.replace_master_services(db, master_id, rows)
    return MasterServicesPutResponse(updated=n)


@router.get("/{master_id}/reviews", response_model=ReviewsPageOut)
async def get_reviews(
    master_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*READ_STAFF))],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> ReviewsPageOut:
    await master_service.get_master(db, user, master_id)
    return await master_phase20.list_reviews_page(db, master_id, page=page, page_size=page_size)


def _review_to_out(r: Review) -> ReviewOut:
    return ReviewOut(
        id=r.id,
        master_id=r.master_id,
        client_id=r.client_id,
        booking_id=r.booking_id,
        rating=r.rating,
        text=r.comment,
        photo_url=r.photo_url,
        source=r.source,
        is_visible=r.is_visible,
        created_at=r.created_at,
        client=None,
    )


@router.post("/{master_id}/reviews", response_model=ReviewOut, status_code=201)
async def add_review(
    master_id: UUID,
    data: ReviewCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.owner, UserRole.admin))],
) -> ReviewOut:
    r = await master_phase20.add_manual_review(db, master_id, data)
    return _review_to_out(r)


@router.delete("/{master_id}/reviews/{review_id}", status_code=204)
async def delete_review(
    master_id: UUID,
    review_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.owner, UserRole.admin))],
) -> None:
    await master_phase20.soft_delete_review(db, master_id, review_id)


@router.get("/{master_id}/stats", response_model=MasterStatsOut)
async def get_master_stats(
    master_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.owner, UserRole.admin, UserRole.master))],
    period: str | None = Query(None, description="week|month|3months|year"),
    from_date: Annotated[str | None, Query(alias="from")] = None,
    to_date: Annotated[str | None, Query(alias="to")] = None,
) -> MasterStatsOut:
    fd = date.fromisoformat(from_date) if from_date else None
    td = date.fromisoformat(to_date) if to_date else None
    return await master_phase20.get_master_stats(db, user, master_id, period=period, from_date=fd, to_date=td)


@router.post("/{master_id}/calendar/manual-booking", response_model=BookingOut, status_code=201)
async def create_manual_booking(
    master_id: UUID,
    data: ManualBookingCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.owner, UserRole.admin, UserRole.reception))],
) -> BookingOut:
    b = await master_phase20.create_manual_master_booking(db, user, master_id, data)
    return BookingOut.model_validate(b)


@router.post("/{master_id}/reset-password", status_code=204)
async def reset_master_password(
    master_id: UUID,
    data: PasswordResetData,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.owner, UserRole.admin))],
) -> None:
    await master_phase20.reset_master_password(db, master_id, data)


@router.get("/{master_id}/calendar", response_model=CalendarResponse)
async def get_master_calendar(
    master_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*READ_STAFF))],
    month: str = Query(..., description="YYYY-MM"),
) -> CalendarResponse:
    if user.role == UserRole.master:
        ensure_master_own_master_id(user, master_id)
    parts = month.split("-")
    if len(parts) != 2:
        raise NotFoundError("Invalid month")
    y, mo = int(parts[0]), int(parts[1])
    tz_name = await _salon_tz(db)
    z = ZoneInfo(tz_name)
    start_local = datetime(y, mo, 1, 0, 0, 0, tzinfo=z)
    if mo == 12:
        end_local = datetime(y + 1, 1, 1, 0, 0, 0, tzinfo=z)
    else:
        end_local = datetime(y, mo + 1, 1, 0, 0, 0, tzinfo=z)
    utc_from = start_local.astimezone(UTC)
    utc_to = end_local.astimezone(UTC)
    bookings = await schedule_service.get_calendar_bookings(
        db, master_id=master_id, utc_from=utc_from, utc_to=utc_to
    )
    slots = await schedule_service.get_calendar_slots(
        db, master_id=master_id, utc_from=utc_from, utc_to=utc_to
    )
    return CalendarResponse(
        bookings=[
            CalendarBookingOut(
                id=b.id,
                master_id=b.master_id,
                client_id=b.client_id,
                service_id=b.service_id,
                starts_at=b.starts_at,
                ends_at=b.ends_at,
                status=b.status.value,
                price=b.price,
            )
            for b in bookings
        ],
        slots=[
            CalendarSlotOut(
                id=s.id,
                master_id=s.master_id,
                slot_type=s.slot_type.value,
                starts_at=s.starts_at,
                ends_at=s.ends_at,
                note=s.note,
            )
            for s in slots
        ],
    )


_BLOCK_SLOT_TYPES = (SlotType.block, SlotType.vacation, SlotType.sick)


@router.get("/{master_id}/blocks", response_model=list[ScheduleBlockOut])
async def list_master_blocks(
    master_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*READ_STAFF))],
) -> list[ScheduleBlockOut]:
    """Все блоки отпуска / больничного / «block» для мастера (до 500 записей)."""
    if user.role == UserRole.master:
        ensure_master_own_master_id(user, master_id)
    master = await db.get(Master, master_id)
    if master is None:
        raise NotFoundError("Master not found")
    rows = (
        (
            await db.execute(
                select(ScheduleSlot)
                .where(
                    ScheduleSlot.master_id == master_id,
                    ScheduleSlot.slot_type.in_(_BLOCK_SLOT_TYPES),
                )
                .order_by(ScheduleSlot.starts_at.asc())
                .limit(500)
            )
        )
        .scalars()
        .all()
    )
    return [
        ScheduleBlockOut(
            id=s.id,
            master_id=s.master_id,
            slot_type=s.slot_type.value,
            starts_at=s.starts_at,
            ends_at=s.ends_at,
            note=s.note,
        )
        for s in rows
    ]


@router.post("/{master_id}/blocks", response_model=ScheduleBlockOut)
async def create_master_block(
    master_id: UUID,
    body: MasterScheduleBlockCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.owner, UserRole.admin, UserRole.master))],
) -> ScheduleBlockOut:
    ensure_master_own_master_id(user, master_id)
    master = await db.get(Master, master_id)
    if master is None:
        raise NotFoundError("Master not found")
    slot = ScheduleSlot(
        master_id=master_id,
        slot_type=body.slot_type,
        starts_at=body.starts_at,
        ends_at=body.ends_at,
        note=body.note,
    )
    db.add(slot)
    await db.flush()
    await db.refresh(slot)
    return ScheduleBlockOut(
        id=slot.id,
        master_id=slot.master_id,
        slot_type=slot.slot_type.value,
        starts_at=slot.starts_at,
        ends_at=slot.ends_at,
        note=slot.note,
    )


@router.delete("/{master_id}/blocks/{block_id}")
async def delete_master_block(
    master_id: UUID,
    block_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.owner, UserRole.admin, UserRole.master))],
) -> dict[str, bool]:
    ensure_master_own_master_id(user, master_id)
    slot = await db.get(ScheduleSlot, block_id)
    if slot is None or slot.master_id != master_id or slot.slot_type not in _BLOCK_SLOT_TYPES:
        raise NotFoundError("Schedule block not found")
    await db.delete(slot)
    await db.flush()
    return {"ok": True}


@router.get("/{master_id}/bookings")
async def get_master_bookings(
    master_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*READ_STAFF))],
) -> dict:
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(Booking)
        .where(
            Booking.master_id == master_id,
            Booking.status.notin_([BookingStatus.cancelled_by_client, BookingStatus.no_show]),
        )
        .options(
            selectinload(Booking.client),
            selectinload(Booking.service),
        )
        .order_by(Booking.starts_at)
    )
    items = result.scalars().all()
    payload = [
        {
            "id": str(b.id),
            "starts_at": b.starts_at,
            "ends_at": b.ends_at,
            "status": b.status.value if hasattr(b.status, "value") else str(b.status),
            "client": {
                "id": str(b.client.id) if b.client else None,
                "first_name": b.client.first_name if b.client else None,
                "last_name": b.client.last_name if b.client else None,
            },
            "service": {
                "id": str(b.service.id) if b.service else None,
                "name": (b.service.name_i18n or {}).get("ru") if b.service and isinstance(b.service.name_i18n, dict) else None,
                "name_i18n": b.service.name_i18n if b.service else None,
            },
        }
        for b in items
    ]
    return {"items": payload, "total": len(payload)}


def _default_working_hours() -> dict[str, dict[str, str | bool]]:
    return {
        "1": {"start": "09:00", "end": "18:00", "enabled": True},
        "2": {"start": "09:00", "end": "18:00", "enabled": True},
        "3": {"start": "09:00", "end": "18:00", "enabled": True},
        "4": {"start": "09:00", "end": "18:00", "enabled": True},
        "5": {"start": "09:00", "end": "18:00", "enabled": True},
        "6": {"start": "10:00", "end": "15:00", "enabled": True},
        "7": {"start": "00:00", "end": "00:00", "enabled": False},
    }


@router.get("/{master_id}/slots")
async def get_master_slots(
    master_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    day: str = Query(..., alias="date"),
    service_id: UUID | None = None,
) -> dict[str, object]:
    master = await db.get(Master, master_id)
    if master is None:
        raise NotFoundError("Master not found")
    try:
        target_date = date.fromisoformat(day)
    except ValueError as exc:
        raise NotFoundError("Invalid date format") from exc

    duration = 60
    if service_id is not None:
        ms = (
            await db.execute(
                select(MasterService).where(
                    MasterService.master_id == master_id,
                    MasterService.service_id == service_id,
                )
            )
        ).scalar_one_or_none()
        if ms is not None and ms.duration_override is not None:
            duration = int(ms.duration_override)
        else:
            svc = await db.get(Service, service_id)
            if svc is not None:
                duration = int(svc.duration_minutes or 60)

    if not isinstance(master.working_hours, dict) or not master.working_hours:
        master.working_hours = _default_working_hours()
        await db.flush()

    times = await schedule_service.get_available_slots(
        db,
        master_id,
        target_date,
        duration,
        apply_lead_time=True,
    )
    return {
        "date": day,
        "duration_minutes": duration,
        "slots": [
            {
                "time": t.strftime("%H:%M"),
                "datetime": datetime.combine(target_date, t).isoformat(),
                "available": True,
            }
            for t in times
        ],
    }


@router.get("/{master_id}/availability")
async def get_master_availability(
    master_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    year: int,
    month: int,
) -> dict[str, list[str]]:
    master = await db.get(Master, master_id)
    if master is None:
        raise NotFoundError("Master not found")
    real_month = month + 1 if 0 <= month <= 11 else month
    _, days_in_month = monthrange(year, real_month)
    ctx = await schedule_service.get_schedule_context(db)
    today = clock.utc_now().astimezone(ZoneInfo(ctx.timezone)).date()
    available_dates: list[str] = []
    for day_num in range(1, days_in_month + 1):
        d = date(year, real_month, day_num)
        if d < today:
            continue
        if await schedule_service.master_has_bookable_window_on_date(db, master_id, d, ctx):
            available_dates.append(d.isoformat())
    return {"available_dates": available_dates}
