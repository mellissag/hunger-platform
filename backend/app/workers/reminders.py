"""Cron: напоминания о визите по Telegram (идемпотентные флаги в booking)."""

from __future__ import annotations

from datetime import timedelta
from typing import Any
from uuid import UUID

from aiogram import Bot
from loguru import logger
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

import app.core.clock as clock

from app.config import get_settings
from app.models.booking import Booking
from app.models.catalog import Service
from app.models.client import Client
from app.models.enums import BookingStatus
from app.models.master import Master
from app.models.salon import Salon

# (часы до визита, поле в booking, ключ текста)
_REMINDER_BUCKETS: tuple[tuple[float, str, str], ...] = (
    (24.0, "reminder_sent_24h", "24h"),
    (2.0, "reminder_sent_2h", "2h"),
    (0.5, "reminder_sent_30m", "30m"),
)

_WINDOW_SECONDS = 5 * 60  # окно ±5 мин под cron каждые 5 мин
_LOOKAHEAD_HOURS = 26


def _intervals_enabled(settings) -> set[float]:
    return {float(x) for x in (settings.reminder_intervals or [])}


def _bucket_allowed(bucket_hours: float, enabled: set[float]) -> bool:
    return any(abs(bucket_hours - h) < 0.02 for h in enabled)


def _reminder_body(
    lang: str,
    kind_key: str,
    *,
    service_name: str,
    master_name: str,
    starts_local: str,
) -> str:
    lines: dict[str, dict[str, str]] = {
        "24h": {
            "en": "Reminder: you have an appointment in 24 hours.",
            "ru": "Напоминание: через 24 часа у вас запись.",
            "uk": "Нагадування: через 24 години у вас запис.",
            "bg": "Напоминание: след 24 часа имате час.",
        },
        "2h": {
            "en": "Reminder: your appointment starts in 2 hours.",
            "ru": "Напоминание: через 2 часа начинается ваша запись.",
            "uk": "Нагадування: через 2 години починається ваш запис.",
            "bg": "Напоминание: след 2 часа започва вашият час.",
        },
        "30m": {
            "en": "Reminder: your appointment starts in 30 minutes.",
            "ru": "Напоминание: через 30 минут начинается ваша запись.",
            "uk": "Нагадування: через 30 хвилин починається ваш запис.",
            "bg": "Напоминание: след 30 минути започва вашият час.",
        },
    }
    head = lines[kind_key].get(lang) or lines[kind_key]["en"]
    return "\n".join(
        [
            head,
            "",
            f"💅 {service_name}",
            f"👤 {master_name}",
            f"🕐 {starts_local}",
        ]
    )


async def _claim_reminder_flag(
    session: AsyncSession, booking_id: UUID, flag_attr: str
) -> bool:
    """Атомарно выставить флаг; True если мы первые (можно слать)."""
    col = getattr(Booking, flag_attr)
    res = await session.execute(
        update(Booking)
        .where(Booking.id == booking_id, col.is_(False))
        .values({col: True})
        .returning(Booking.id)
    )
    return res.first() is not None


async def _revert_reminder_flag(session: AsyncSession, booking_id: UUID, flag_attr: str) -> None:
    col = getattr(Booking, flag_attr)
    await session.execute(update(Booking).where(Booking.id == booking_id).values({col: False}))


async def process_booking_reminders(ctx: dict[str, Any]) -> None:
    """Cron: каждые 5 мин — confirmed, starts_at в ближайшие 26 ч."""
    settings_app = get_settings()
    if not settings_app.telegram_bot_token:
        logger.warning("reminders skipped: TELEGRAM_BOT_TOKEN not set")
        return

    factory = ctx["db"]
    async with factory() as session:
        await _run_reminders_session(session, settings_app.telegram_bot_token)


async def _run_reminders_session(session: AsyncSession, token: str) -> None:
    now = clock.utc_now()
    window_end = now + timedelta(hours=_LOOKAHEAD_HOURS)

    salon_row = await session.execute(select(Salon).options(joinedload(Salon.settings)).limit(1))
    salon = salon_row.scalars().unique().first()
    if salon is None or salon.settings is None:
        logger.warning("reminders: no salon/settings")
        return
    enabled = _intervals_enabled(salon.settings)

    res = await session.execute(
        select(Booking, Client, Service, Master)
        .join(Client, Booking.client_id == Client.id)
        .join(Service, Booking.service_id == Service.id)
        .join(Master, Booking.master_id == Master.id)
        .where(
            Booking.status == BookingStatus.confirmed,
            Booking.starts_at >= now,
            Booking.starts_at <= window_end,
        )
    )
    rows = res.all()
    if not rows:
        return

    bot = Bot(token=token)
    try:
        for booking, client, service, master in rows:
            if client.tg_user_id is None:
                continue
            delta_sec = (booking.starts_at - now).total_seconds()
            lang = (client.lang or "en").split("-")[0].lower()
            if lang not in ("en", "ru", "uk", "bg"):
                lang = "en"

            service_name = str(
                (service.name_i18n or {}).get(lang)
                or (service.name_i18n or {}).get("en")
                or "Service"
            )
            master_name = master.display_name
            starts_local = booking.starts_at.strftime("%Y-%m-%d %H:%M UTC")

            for bucket_hours, flag_attr, kind_key in _REMINDER_BUCKETS:
                if not _bucket_allowed(bucket_hours, enabled):
                    continue
                target_sec = bucket_hours * 3600.0
                if abs(delta_sec - target_sec) > _WINDOW_SECONDS:
                    continue

                claimed = await _claim_reminder_flag(session, booking.id, flag_attr)
                if not claimed:
                    continue
                await session.commit()

                text = _reminder_body(
                    lang,
                    kind_key,
                    service_name=service_name,
                    master_name=master_name,
                    starts_local=starts_local,
                )
                try:
                    await bot.send_message(int(client.tg_user_id), text)
                except Exception as exc:
                    logger.exception(
                        "reminder send failed booking={} flag={} err={}",
                        booking.id,
                        flag_attr,
                        exc,
                    )
                    await _revert_reminder_flag(session, booking.id, flag_attr)
                    await session.commit()
    finally:
        await bot.session.close()
