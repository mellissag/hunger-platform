"""CRUD рассылок, подготовка получателей, постановка в ARQ."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from loguru import logger
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

import app.core.clock as clock

from app.config import get_settings
from app.core.exceptions import BroadcastInvalidStateError, EmptySegmentError, NotFoundError
from app.models.auto_trigger import AutoTrigger
from app.models.broadcast import Broadcast, BroadcastRecipient
from app.models.enums import BroadcastStatus
from app.models.user import User
from app.schemas.broadcast import BroadcastCreate, BroadcastSendBody, BroadcastUpdate
from app.schemas.segment import SegmentCriteria
from app.services import segment_service


def _nonempty_message_i18n(m: dict[str, Any]) -> bool:
    return any(str(v or "").strip() for v in m.values())


def _keyboard_to_json(kb: object | None) -> dict[str, Any] | None:
    if kb is None:
        return None
    return kb.model_dump(mode="json")  # type: ignore[union-attr]


async def enqueue_send_broadcast_job(broadcast_id: UUID, scheduled_at: datetime | None) -> None:
    """Ставит задачу send_broadcast в ARQ (с отложенным стартом при необходимости)."""
    settings = get_settings()
    if not settings.redis_url:
        logger.warning("REDIS_URL not set; broadcast {} will not be sent automatically", broadcast_id)
        return
    from arq.connections import RedisSettings, create_pool

    pool = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    try:
        now = clock.utc_now()
        defer: datetime | None = None
        if scheduled_at is not None and scheduled_at > now:
            defer = scheduled_at
        if defer is not None:
            await pool.enqueue_job("send_broadcast", str(broadcast_id), _defer_until=defer)
        else:
            await pool.enqueue_job("send_broadcast", str(broadcast_id))
    finally:
        await pool.close(close_connection_pool=True)


async def enqueue_post_visit_trigger_job(booking_id: UUID, delay_hours: int) -> None:
    """Ставит задачу fire_post_visit_trigger в ARQ с задержкой."""
    settings = get_settings()
    if not settings.redis_url:
        logger.warning("REDIS_URL not set; post-visit trigger {} skipped", booking_id)
        return
    from arq.connections import RedisSettings, create_pool

    pool = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    try:
        defer_by = max(0, int(delay_hours)) * 3600
        await pool.enqueue_job("fire_post_visit_trigger", str(booking_id), _defer_by=defer_by)
    finally:
        await pool.close(close_connection_pool=True)


async def create_broadcast(
    db: AsyncSession,
    user: User,
    body: BroadcastCreate,
) -> Broadcast:
    SegmentCriteria.model_validate(body.segment)
    if not _nonempty_message_i18n(body.message_i18n):
        raise ValueError("At least one language must have non-empty message text")
    bc = Broadcast(
        title=body.title,
        message_i18n=dict(body.message_i18n),
        media_url=body.media_url,
        media_type=body.media_type,
        inline_keyboard=_keyboard_to_json(body.inline_keyboard),
        segment=dict(body.segment),
        status=BroadcastStatus.draft,
        created_by_user_id=user.id,
        stats={},
    )
    db.add(bc)
    await db.flush()
    await db.refresh(bc)
    return bc


async def update_broadcast(
    db: AsyncSession,
    broadcast_id: UUID,
    body: BroadcastUpdate,
) -> Broadcast:
    bc = await db.get(Broadcast, broadcast_id)
    if bc is None:
        raise NotFoundError("Broadcast not found")
    if bc.status not in (BroadcastStatus.draft, BroadcastStatus.scheduled):
        raise BroadcastInvalidStateError("Only draft or scheduled broadcasts can be edited")
    patch = body.model_dump(exclude_unset=True)
    if "segment" in patch:
        SegmentCriteria.model_validate(patch["segment"])
    if "message_i18n" in patch:
        if not _nonempty_message_i18n(patch["message_i18n"]):
            raise ValueError("At least one language must have non-empty message text")
    if "inline_keyboard" in patch:
        patch["inline_keyboard"] = _keyboard_to_json(body.inline_keyboard)
    for key, val in patch.items():
        setattr(bc, key, val)
    await db.flush()
    await db.refresh(bc)
    return bc


async def delete_broadcast(db: AsyncSession, broadcast_id: UUID) -> None:
    bc = await db.get(Broadcast, broadcast_id)
    if bc is None:
        raise NotFoundError("Broadcast not found")
    if bc.status not in (BroadcastStatus.draft, BroadcastStatus.scheduled):
        raise BroadcastInvalidStateError("Only draft or scheduled broadcasts can be deleted")
    await db.delete(bc)


async def get_broadcast(db: AsyncSession, broadcast_id: UUID) -> Broadcast:
    bc = await db.get(Broadcast, broadcast_id)
    if bc is None:
        raise NotFoundError("Broadcast not found")
    return bc


async def list_broadcasts(
    db: AsyncSession,
    *,
    page: int,
    page_size: int,
) -> tuple[list[Broadcast], int]:
    total = int(
        (await db.execute(select(func.count()).select_from(Broadcast))).scalar_one() or 0
    )
    offset = (page - 1) * page_size
    res = await db.execute(
        select(Broadcast)
        .order_by(Broadcast.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    return list(res.scalars().all()), total


async def prepare_send(
    db: AsyncSession,
    broadcast_id: UUID,
    body: BroadcastSendBody,
) -> Broadcast:
    """Заполняет получателей, выставляет статус scheduled и планирует время."""
    bc = await get_broadcast(db, broadcast_id)
    if bc.status != BroadcastStatus.draft:
        raise BroadcastInvalidStateError("Only draft broadcasts can be sent")
    if not _nonempty_message_i18n(bc.message_i18n):
        raise ValueError("Message is empty")
    criteria = SegmentCriteria.model_validate(bc.segment)
    client_ids = await segment_service.build_segment_ids(db, criteria)
    if not client_ids:
        raise EmptySegmentError()

    await db.execute(
        delete(BroadcastRecipient).where(BroadcastRecipient.broadcast_id == broadcast_id)
    )
    for cid in client_ids:
        db.add(
            BroadcastRecipient(
                broadcast_id=broadcast_id,
                client_id=cid,
            )
        )

    total = len(client_ids)
    when = body.scheduled_at
    if when is None:
        when = clock.utc_now()
    bc.scheduled_at = when
    bc.stats = {"total": total, "sent": 0, "delivered": 0, "failed": 0}
    bc.status = BroadcastStatus.scheduled
    await db.flush()
    await db.refresh(bc)
    return bc


async def publish_and_enqueue(
    db: AsyncSession,
    broadcast_id: UUID,
    body: BroadcastSendBody,
) -> Broadcast:
    """Подготовка, commit и постановка в очередь."""
    bc = await prepare_send(db, broadcast_id, body)
    await db.commit()
    await db.refresh(bc)
    try:
        await enqueue_send_broadcast_job(broadcast_id, bc.scheduled_at)
    except Exception:
        logger.exception("enqueue send_broadcast failed for {}", broadcast_id)
        raise
    return bc


async def get_active_post_visit_trigger(db: AsyncSession, master_id: UUID | None) -> AutoTrigger | None:
    if master_id is not None:
        scoped = (
            await db.execute(
                select(AutoTrigger).where(
                    AutoTrigger.type == "post_visit",
                    AutoTrigger.is_active.is_(True),
                    AutoTrigger.master_id == master_id,
                )
            )
        ).scalar_one_or_none()
        if scoped is not None:
            return scoped
    return (
        await db.execute(
            select(AutoTrigger).where(
                AutoTrigger.type == "post_visit",
                AutoTrigger.is_active.is_(True),
                AutoTrigger.master_id.is_(None),
            )
        )
    ).scalar_one_or_none()
