"""Уведомления мастерам в Telegram."""

from __future__ import annotations

import logging
from uuid import UUID

from aiogram import Bot
from aiogram.exceptions import TelegramForbiddenError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import Booking
from app.models.catalog import Service
from app.models.client import Client
from app.models.master import Master

logger = logging.getLogger(__name__)


async def notify_master_new_booking(booking_id: UUID, bot: Bot | None, db: AsyncSession) -> None:
    if bot is None:
        return
    b = await db.get(Booking, booking_id)
    if b is None:
        return
    m = await db.get(Master, b.master_id)
    if m is None or not m.tg_user_id:
        return
    client = await db.get(Client, b.client_id)
    svc = await db.get(Service, b.service_id)
    name_i18n = svc.name_i18n if svc and isinstance(svc.name_i18n, dict) else {}
    svc_name = str(name_i18n.get("ru") or name_i18n.get("en") or "—")
    cname = "—"
    if client:
        cname = " ".join(x for x in (client.first_name or "", client.last_name or "") if x).strip() or "—"
    phone = client.phone if client and client.phone else "—"
    text = (
        f"Новая запись!\n"
        f"Клиент: {cname}\n"
        f"Услуга: {svc_name}\n"
        f"Время: {b.starts_at.strftime('%d.%m %H:%M')} UTC\n"
        f"Тел: {phone}"
    )
    try:
        await bot.send_message(chat_id=int(m.tg_user_id), text=text)
    except TelegramForbiddenError:
        logger.info("master tg forbidden chat_id=%s", m.tg_user_id)
    except Exception:  # noqa: BLE001
        logger.exception("notify_master_new_booking failed booking_id=%s", booking_id)


async def notify_master_booking_cancelled(booking_id: UUID, bot: Bot | None, db: AsyncSession) -> None:
    if bot is None:
        return
    b = await db.get(Booking, booking_id)
    if b is None:
        return
    m = await db.get(Master, b.master_id)
    if m is None or not m.tg_user_id:
        return
    text = f"Запись отменена.\nВремя было: {b.starts_at.strftime('%d.%m %H:%M')} UTC"
    try:
        await bot.send_message(chat_id=int(m.tg_user_id), text=text)
    except TelegramForbiddenError:
        pass
    except Exception:  # noqa: BLE001
        logger.exception("notify_master_booking_cancelled failed")
