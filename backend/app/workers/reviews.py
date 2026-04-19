"""Cron: отправка запросов на отзыв после завершённого визита (идемпотентно)."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from aiogram import Bot
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup
from loguru import logger
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

import app.core.clock as clock

from app.bot.fluent_i18n import format_message
from app.models.booking import Booking
from app.models.client import Client
from app.models.enums import BookingStatus
from app.models.master import Master
from app.models.salon import Settings


def _review_stars_keyboard(locale: str) -> InlineKeyboardMarkup:
    stars_row = [
        InlineKeyboardButton(text="★" * i, callback_data=f"review:{i}")
        for i in range(1, 6)
    ]
    skip_row = [
        InlineKeyboardButton(
            text=format_message(locale, "review-skip-btn"),
            callback_data="review:skip",
        )
    ]
    return InlineKeyboardMarkup(inline_keyboard=[stars_row, skip_row])


async def run_review_sender(ctx: dict[str, Any]) -> None:
    """ARQ cron task: send review requests to eligible completed bookings."""
    from app.config import get_settings

    cfg = get_settings()
    if not cfg.telegram_bot_token:
        logger.warning("review_sender: TELEGRAM_BOT_TOKEN not set, skipping")
        return

    bot: Bot = ctx.get("bot") or Bot(token=cfg.telegram_bot_token)
    dp = ctx.get("dp")

    factory = ctx["db"]
    async with factory() as db:
        await _run_review_session(db, bot, dp)


async def _run_review_session(db: AsyncSession, bot: Bot, dp: Any) -> None:
    settings_row = (await db.execute(select(Settings).limit(1))).scalar_one_or_none()
    delay_hours: int = settings_row.review_delay_hours if settings_row else 2
    now = clock.utc_now()
    cutoff = now - timedelta(hours=delay_hours)

    stmt = (
        select(Booking)
        .where(
            Booking.status == BookingStatus.completed,
            Booking.review_sent.is_(False),
            Booking.ends_at <= cutoff,
        )
        .options(joinedload(Booking.review))
        .limit(50)
    )
    bookings = (await db.execute(stmt)).scalars().unique().all()

    if not bookings:
        return

    client_ids = list({b.client_id for b in bookings})
    master_ids = list({b.master_id for b in bookings})

    clients_map: dict = {
        c.id: c
        for c in (await db.execute(select(Client).where(Client.id.in_(client_ids)))).scalars()
    }
    masters_map: dict = {
        m.id: m
        for m in (await db.execute(select(Master).where(Master.id.in_(master_ids)))).scalars()
    }

    sent_ids = []
    for booking in bookings:
        if booking.review is not None:
            sent_ids.append(booking.id)
            continue

        client = clients_map.get(booking.client_id)
        master = masters_map.get(booking.master_id)
        if client is None or not client.tg_user_id:
            sent_ids.append(booking.id)
            continue

        locale = client.lang or "en"
        master_name = master.display_name if master else "—"
        text = format_message(locale, "review-prompt", {"master": master_name})

        try:
            await _set_review_fsm_state(dp, bot, client.tg_user_id, str(booking.id))
            await bot.send_message(
                chat_id=client.tg_user_id,
                text=text,
                reply_markup=_review_stars_keyboard(locale),
            )
            sent_ids.append(booking.id)
            logger.info("review_sender: sent", booking_id=str(booking.id))
        except Exception as exc:
            logger.warning("review_sender: failed", booking_id=str(booking.id), error=str(exc))
            sent_ids.append(booking.id)

    if sent_ids:
        await db.execute(
            update(Booking).where(Booking.id.in_(sent_ids)).values(review_sent=True)
        )
        await db.commit()


async def _set_review_fsm_state(dp: Any, bot: Bot, tg_user_id: int, booking_id: str) -> None:
    """Inject FSM state so review router can find booking_id."""
    if dp is None:
        return
    try:
        from aiogram.fsm.storage.base import StorageKey

        from app.bot.states import ReviewStates

        key = StorageKey(bot_id=bot.id, chat_id=tg_user_id, user_id=tg_user_id)
        await dp.storage.set_state(key=key, state=ReviewStates.await_rating)
        await dp.storage.set_data(key=key, data={"review_booking_id": booking_id})
    except Exception as exc:
        logger.warning("review_sender: set_state failed", error=str(exc))
