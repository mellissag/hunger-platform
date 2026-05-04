"""CRUD рассылок и запуск отправки."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, require_roles
from app.models.auto_trigger import AutoTrigger
from app.models.broadcast import Broadcast, BroadcastRecipient
from app.models.client import Client
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.broadcast import (
    BroadcastCreate,
    BroadcastOut,
    BroadcastSendBody,
    BroadcastUpdate,
)
from app.schemas.broadcasts import (
    AutoTriggerCreate,
    AutoTriggerOut,
    AutoTriggerUpdate,
    BroadcastRecipientOut,
)
from app.schemas.common import PaginatedResponse
from app.services import broadcast_service

router = APIRouter(prefix="/broadcasts", tags=["broadcasts"])
triggers_router = APIRouter(prefix="/auto-triggers", tags=["auto-triggers"])

STAFF = (UserRole.owner, UserRole.admin)
OWNER = (UserRole.owner,)


def _to_out(bc: Broadcast) -> BroadcastOut:
    return BroadcastOut(
        id=bc.id,
        title=bc.title,
        message_i18n=dict(bc.message_i18n or {}),
        segment=dict(bc.segment or {}),
        media_url=bc.media_url,
        media_type=bc.media_type,
        inline_keyboard=dict(bc.inline_keyboard) if bc.inline_keyboard else None,
        status=bc.status,
        scheduled_at=bc.scheduled_at,
        sent_at=bc.sent_at,
        stats=dict(bc.stats or {}),
        created_by_user_id=bc.created_by_user_id,
        created_at=bc.created_at,
        updated_at=bc.updated_at,
    )


@router.get("", response_model=PaginatedResponse[BroadcastOut])
async def list_broadcasts(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*STAFF))],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> PaginatedResponse[BroadcastOut]:
    rows, total = await broadcast_service.list_broadcasts(db, page=page, page_size=page_size)
    return PaginatedResponse(
        items=[_to_out(b) for b in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=BroadcastOut)
async def create_broadcast(
    body: BroadcastCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*STAFF))],
) -> BroadcastOut:
    try:
        bc = await broadcast_service.create_broadcast(db, user, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return _to_out(bc)


@router.get("/{broadcast_id}", response_model=BroadcastOut)
async def get_broadcast(
    broadcast_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*STAFF))],
) -> BroadcastOut:
    from app.core.exceptions import NotFoundError

    try:
        bc = await broadcast_service.get_broadcast(db, broadcast_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=e.message) from e
    return _to_out(bc)


@router.patch("/{broadcast_id}", response_model=BroadcastOut)
async def update_broadcast(
    broadcast_id: UUID,
    body: BroadcastUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*STAFF))],
) -> BroadcastOut:
    from app.core.exceptions import BroadcastInvalidStateError, NotFoundError

    try:
        bc = await broadcast_service.update_broadcast(db, broadcast_id, body)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=e.message) from e
    except BroadcastInvalidStateError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return _to_out(bc)


@router.delete("/{broadcast_id}", status_code=204)
async def delete_broadcast(
    broadcast_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*STAFF))],
) -> None:
    from app.core.exceptions import BroadcastInvalidStateError, NotFoundError

    try:
        await broadcast_service.delete_broadcast(db, broadcast_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=e.message) from e
    except BroadcastInvalidStateError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message) from e


@router.post("/{broadcast_id}/send", response_model=BroadcastOut)
async def send_broadcast(
    broadcast_id: UUID,
    body: BroadcastSendBody,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*STAFF))],
) -> BroadcastOut:
    from app.core.exceptions import (
        BroadcastInvalidStateError,
        EmptySegmentError,
        NotFoundError,
    )

    try:
        bc = await broadcast_service.publish_and_enqueue(db, broadcast_id, body)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=e.message) from e
    except BroadcastInvalidStateError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message) from e
    except EmptySegmentError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return _to_out(bc)


@router.get("/{broadcast_id}/recipients", response_model=list[BroadcastRecipientOut])
async def broadcast_recipients(
    broadcast_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*STAFF))],
) -> list[BroadcastRecipientOut]:
    rows = (
        await db.execute(
            select(
                BroadcastRecipient.client_id,
                BroadcastRecipient.status,
                BroadcastRecipient.error,
                BroadcastRecipient.sent_at,
                Client.first_name,
                Client.last_name,
            )
            .join(Client, Client.id == BroadcastRecipient.client_id)
            .where(BroadcastRecipient.broadcast_id == broadcast_id)
            .order_by(BroadcastRecipient.sent_at.desc().nulls_last())
        )
    ).all()
    return [
        BroadcastRecipientOut(
            client_id=client_id,
            client_name=" ".join(filter(None, [first_name, last_name])) or None,
            status=str(status.value if hasattr(status, "value") else status),
            error_reason=error,
            sent_at=sent_at,
        )
        for client_id, status, error, sent_at, first_name, last_name in rows
    ]


# ── Stats ─────────────────────────────────────────────────────────────────────

class BroadcastStatsCampaign(BaseModel):
    id: str
    title: str
    status: str
    sent_at: datetime | None
    total: int
    sent: int
    delivered: int
    failed: int
    delivery_rate: float


class BroadcastStatsDaily(BaseModel):
    date: str
    sent: int
    delivered: int


class BroadcastStatsSummaryOut(BaseModel):
    total_broadcasts: int
    total_recipients: int
    total_sent: int
    total_delivered: int
    total_failed: int
    delivery_rate: float
    daily_chart: list[BroadcastStatsDaily]
    campaigns: list[BroadcastStatsCampaign]


def _int_stat(stats: dict[str, Any], key: str) -> int:
    v = stats.get(key, 0)
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


@router.get("/stats/summary", response_model=BroadcastStatsSummaryOut)
async def broadcasts_stats_summary(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*STAFF))],
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    status: str | None = Query(None),
) -> BroadcastStatsSummaryOut:
    stmt = select(Broadcast)
    if date_from:
        stmt = stmt.where(Broadcast.created_at >= datetime(date_from.year, date_from.month, date_from.day))
    if date_to:
        stmt = stmt.where(
            Broadcast.created_at < datetime(date_to.year, date_to.month, date_to.day + 1)
            if date_to.day < 28 else datetime(date_to.year, date_to.month, date_to.day, 23, 59, 59)
        )
    if status:
        from app.models.enums import BroadcastStatus
        try:
            stmt = stmt.where(Broadcast.status == BroadcastStatus(status))
        except ValueError:
            pass
    broadcasts: list[Broadcast] = list((await db.execute(stmt.order_by(Broadcast.created_at.desc()))).scalars().all())

    total_recipients = sum(_int_stat(b.stats, "total") for b in broadcasts)
    total_sent = sum(_int_stat(b.stats, "sent") for b in broadcasts)
    total_delivered = sum(_int_stat(b.stats, "delivered") for b in broadcasts)
    total_failed = sum(_int_stat(b.stats, "failed") for b in broadcasts)
    delivery_rate = round(total_delivered / total_sent * 100, 1) if total_sent else 0.0

    # Daily chart grouped by sent_at date
    sent_broadcasts = [b for b in broadcasts if b.sent_at is not None]
    daily_map: dict[str, BroadcastStatsDaily] = {}
    for b in sent_broadcasts:
        day_key = b.sent_at.strftime("%Y-%m-%d")  # type: ignore[union-attr]
        if day_key not in daily_map:
            daily_map[day_key] = BroadcastStatsDaily(date=day_key, sent=0, delivered=0)
        daily_map[day_key].sent += _int_stat(b.stats, "sent")
        daily_map[day_key].delivered += _int_stat(b.stats, "delivered")
    daily_chart = sorted(daily_map.values(), key=lambda x: x.date)

    campaigns = [
        BroadcastStatsCampaign(
            id=str(b.id),
            title=b.title,
            status=b.status.value if hasattr(b.status, "value") else str(b.status),
            sent_at=b.sent_at,
            total=_int_stat(b.stats, "total"),
            sent=_int_stat(b.stats, "sent"),
            delivered=_int_stat(b.stats, "delivered"),
            failed=_int_stat(b.stats, "failed"),
            delivery_rate=round(
                _int_stat(b.stats, "delivered") / _int_stat(b.stats, "sent") * 100, 1
            ) if _int_stat(b.stats, "sent") else 0.0,
        )
        for b in broadcasts
    ]

    return BroadcastStatsSummaryOut(
        total_broadcasts=len(broadcasts),
        total_recipients=total_recipients,
        total_sent=total_sent,
        total_delivered=total_delivered,
        total_failed=total_failed,
        delivery_rate=delivery_rate,
        daily_chart=daily_chart,
        campaigns=campaigns,
    )


@triggers_router.get("", response_model=list[AutoTriggerOut])
async def list_auto_triggers(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*OWNER))],
) -> list[AutoTriggerOut]:
    rows = (await db.execute(select(AutoTrigger).order_by(AutoTrigger.created_at.desc()))).scalars().all()
    return [AutoTriggerOut.model_validate(r) for r in rows]


@triggers_router.post("", response_model=AutoTriggerOut)
async def create_auto_trigger(
    body: AutoTriggerCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*OWNER))],
) -> AutoTriggerOut:
    trigger = AutoTrigger(
        type=body.type,
        is_active=body.is_active,
        delay_hours=body.delay_hours,
        template_text=body.template_text,
        photo_url=body.photo_url,
        buttons=[b.model_dump(mode="json") for b in body.buttons] or None,
        master_id=body.master_id,
    )
    db.add(trigger)
    await db.commit()
    await db.refresh(trigger)
    return AutoTriggerOut.model_validate(trigger)


@triggers_router.patch("/{trigger_id}", response_model=AutoTriggerOut)
async def update_auto_trigger(
    trigger_id: UUID,
    body: AutoTriggerUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*OWNER))],
) -> AutoTriggerOut:
    trigger = await db.get(AutoTrigger, trigger_id)
    if trigger is None:
        raise HTTPException(status_code=404, detail="Trigger not found")
    patch = body.model_dump(exclude_unset=True)
    if "buttons" in patch and patch["buttons"] is not None:
        patch["buttons"] = [b.model_dump(mode="json") for b in body.buttons or []]
    for k, v in patch.items():
        setattr(trigger, k, v)
    await db.commit()
    await db.refresh(trigger)
    return AutoTriggerOut.model_validate(trigger)


@triggers_router.delete("/{trigger_id}", status_code=204)
async def delete_auto_trigger(
    trigger_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*OWNER))],
) -> None:
    trigger = await db.get(AutoTrigger, trigger_id)
    if trigger is None:
        raise HTTPException(status_code=404, detail="Trigger not found")
    await db.delete(trigger)
    await db.commit()
