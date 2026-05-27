"""Операции бронирования для Telegram-клиента (без JWT)."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

import app.core.clock as clock
from app.core.exceptions import ForbiddenScopeError
from app.models.booking import BlacklistEntry, Booking
from app.models.enums import BookingCreatedVia
from app.schemas.booking import BookingCreate
from app.services import booking_service
from app.services.bot_actor import get_bot_actor_user
from app.services.notifications import notify_master_new_booking

if TYPE_CHECKING:
    from aiogram import Bot


async def is_blacklisted(db: AsyncSession, client_id: UUID) -> bool:
    now = clock.utc_now()
    n = await db.scalar(
        select(BlacklistEntry.id).where(
            BlacklistEntry.client_id == client_id,
            or_(BlacklistEntry.expires_at.is_(None), BlacklistEntry.expires_at > now),
        )
    )
    return n is not None


async def create_tg_booking(
    db: AsyncSession,
    *,
    client_id: UUID,
    master_id: UUID,
    service_id: UUID,
    starts_at: datetime,
    telegram_bot: "Bot | None" = None,
    promo_code: str | None = None,
) -> Booking:
    actor = await get_bot_actor_user(db)
    data = BookingCreate(
        client_id=client_id,
        master_id=master_id,
        service_id=service_id,
        starts_at=starts_at,
        created_via=BookingCreatedVia.bot,
        promo_code=promo_code,
    )
    b = await booking_service.create_booking(db, actor, data)
    await notify_master_new_booking(b.id, telegram_bot, db)
    return b


async def create_wa_booking(
    db: AsyncSession,
    *,
    client_id: UUID,
    master_id: UUID,
    service_id: UUID,
    starts_at: datetime,
    telegram_bot: "Bot | None" = None,
) -> Booking:
    """Бронирование из WhatsApp-бота (тот же календарь и правила слота, что у Telegram)."""
    actor = await get_bot_actor_user(db)
    data = BookingCreate(
        client_id=client_id,
        master_id=master_id,
        service_id=service_id,
        starts_at=starts_at,
        created_via=BookingCreatedVia.whatsapp,
    )
    b = await booking_service.create_booking(db, actor, data)
    await notify_master_new_booking(b.id, telegram_bot, db)
    return b


async def create_ai_chat_booking(
    db: AsyncSession,
    *,
    client_id: UUID,
    master_id: UUID,
    service_id: UUID,
    starts_at: datetime,
    telegram_bot: "Bot | None" = None,
) -> Booking:
    """Booking from AI chat (Mini App / site widget)."""
    actor = await get_bot_actor_user(db)
    data = BookingCreate(
        client_id=client_id,
        master_id=master_id,
        service_id=service_id,
        starts_at=starts_at,
        created_via=BookingCreatedVia.ai_chat,
    )
    b = await booking_service.create_booking(db, actor, data)
    await notify_master_new_booking(b.id, telegram_bot, db)
    return b


async def create_ig_booking(
    db: AsyncSession,
    *,
    client_id: UUID,
    master_id: UUID,
    service_id: UUID,
    starts_at: datetime,
    telegram_bot: "Bot | None" = None,
) -> Booking:
    """Бронирование из Instagram DM-бота."""
    actor = await get_bot_actor_user(db)
    data = BookingCreate(
        client_id=client_id,
        master_id=master_id,
        service_id=service_id,
        starts_at=starts_at,
        created_via=BookingCreatedVia.instagram,
    )
    b = await booking_service.create_booking(db, actor, data)
    await notify_master_new_booking(b.id, telegram_bot, db)
    return b


async def list_client_bookings(db: AsyncSession, client_id: UUID) -> list[Booking]:
    stmt = (
        select(Booking)
        .where(Booking.client_id == client_id)
        .order_by(Booking.starts_at.desc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows)


async def cancel_tg_booking(
    db: AsyncSession, *, client_id: UUID, booking_id: UUID, reason: str | None
) -> Booking:
    actor = await get_bot_actor_user(db)
    b = await booking_service.get_booking(db, actor, booking_id)
    if b.client_id != client_id:
        raise ForbiddenScopeError("Not your booking")
    return await booking_service.cancel_booking(
        db, actor, booking_id, actor="client", reason=reason
    )


async def reschedule_tg_booking(
    db: AsyncSession, *, client_id: UUID, booking_id: UUID, new_starts_at: datetime
) -> Booking:
    actor = await get_bot_actor_user(db)
    b = await booking_service.get_booking(db, actor, booking_id)
    if b.client_id != client_id:
        raise ForbiddenScopeError("Not your booking")
    return await booking_service.reschedule_booking(db, actor, booking_id, new_starts_at)
