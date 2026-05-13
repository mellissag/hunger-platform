"""Уведомления мастерам и клиентам в Telegram."""

from __future__ import annotations

import logging
from uuid import UUID

from aiogram import Bot
from aiogram.exceptions import TelegramForbiddenError
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup
from sqlalchemy.ext.asyncio import AsyncSession

from app.messages import get_message
from app.models.booking import Booking
from app.models.catalog import Service
from app.models.client import Client
from app.models.master import Master
from app.services.broadcast_analytics import record_client_blocked_after_delivered_broadcast
from app.utils.datetime_utils import format_booking_datetime

logger = logging.getLogger(__name__)


def _svc_name(svc: Service | None) -> str:
    name_i18n = svc.name_i18n if svc and isinstance(svc.name_i18n, dict) else {}
    return str(name_i18n.get("ru") or name_i18n.get("en") or "—")


def _client_name(client: Client | None) -> str:
    if not client:
        return "—"
    return " ".join(x for x in (client.first_name or "", client.last_name or "") if x).strip() or "—"


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
    cname = _client_name(client)
    phone = client.phone if client and client.phone else "—"
    text = (
        f"\U0001f4c5 <b>Новая запись!</b>\n\n"
        f"\U0001f464 Клиент: {cname}\n"
        f"\U0001f487 Услуга: {_svc_name(svc)}\n"
        f"\U0001f4c6 Время: {format_booking_datetime(b.starts_at, 'ru')}\n"
        f"\U0001f4de Тел: {phone}"
    )
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="\u2705 Подтвердить",
                    callback_data=f"bk:confirm:{b.id}",
                ),
                InlineKeyboardButton(
                    text="\u274c Отказать",
                    callback_data=f"bk:reject:{b.id}",
                ),
                InlineKeyboardButton(
                    text="\U0001f550 Перенести",
                    callback_data=f"bk:reschedule:{b.id}",
                ),
            ]
        ]
    )
    try:
        await bot.send_message(
            chat_id=int(m.tg_user_id),
            text=text,
            reply_markup=keyboard,
            parse_mode="HTML",
        )
    except TelegramForbiddenError:
        logger.info("master tg forbidden chat_id=%s", m.tg_user_id)
    except Exception:  # noqa: BLE001
        logger.exception("notify_master_new_booking failed booking_id=%s", booking_id)


async def notify_master_booking_updated(booking_id: UUID, bot: Bot | None, db: AsyncSession) -> None:
    if bot is None:
        return
    b = await db.get(Booking, booking_id)
    if b is None:
        return
    m = await db.get(Master, b.master_id)
    if m is None or not m.tg_user_id:
        return
    text = (
        f"Запись обновлена.\n"
        f"Новое время: {format_booking_datetime(b.starts_at, 'ru')}"
    )
    try:
        await bot.send_message(chat_id=int(m.tg_user_id), text=text)
    except TelegramForbiddenError:
        pass
    except Exception:  # noqa: BLE001
        logger.exception("notify_master_booking_updated failed booking_id=%s", booking_id)


async def notify_master_booking_cancelled(booking_id: UUID, bot: Bot | None, db: AsyncSession) -> None:
    if bot is None:
        return
    b = await db.get(Booking, booking_id)
    if b is None:
        return
    m = await db.get(Master, b.master_id)
    if m is None or not m.tg_user_id:
        return
    text = f"Запись отменена.\nВремя было: {format_booking_datetime(b.starts_at, 'ru')}"
    try:
        await bot.send_message(chat_id=int(m.tg_user_id), text=text)
    except TelegramForbiddenError:
        pass
    except Exception:  # noqa: BLE001
        logger.exception("notify_master_booking_cancelled failed")


async def notify_master_booking_status_changed(
    booking_id: UUID, bot: Bot | None, db: AsyncSession, *, status_label: str
) -> None:
    if bot is None:
        return
    b = await db.get(Booking, booking_id)
    if b is None:
        return
    m = await db.get(Master, b.master_id)
    if m is None or not m.tg_user_id:
        return
    text = f"Статус записи изменён: {status_label}.\nВремя: {format_booking_datetime(b.starts_at, 'ru')}"
    try:
        await bot.send_message(chat_id=int(m.tg_user_id), text=text)
    except TelegramForbiddenError:
        pass
    except Exception:  # noqa: BLE001
        logger.exception("notify_master_booking_status_changed failed")


async def notify_client_booking_confirmed(booking_id: UUID, bot: Bot | None, db: AsyncSession) -> None:
    if bot is None:
        return
    b = await db.get(Booking, booking_id)
    if b is None:
        return
    client = await db.get(Client, b.client_id)
    if client is None or not client.tg_user_id:
        return
    m = await db.get(Master, b.master_id)
    svc = await db.get(Service, b.service_id)
    lang = client.lang or "ru"
    text = get_message(
        "booking_confirmed",
        lang=lang,
        service=_svc_name(svc),
        master=m.display_name if m else "—",
        date=format_booking_datetime(b.starts_at, lang),
    )
    try:
        await bot.send_message(chat_id=int(client.tg_user_id), text=text, parse_mode="HTML")
    except TelegramForbiddenError:
        logger.info("client tg forbidden chat_id=%s", client.tg_user_id)
        try:
            await record_client_blocked_after_delivered_broadcast(db, client.id)
        except Exception:  # noqa: BLE001
            logger.exception("broadcast unsubscribed bump failed booking_id=%s", booking_id)
    except Exception:  # noqa: BLE001
        logger.exception("notify_client_booking_confirmed failed booking_id=%s", booking_id)


async def notify_client_booking_rejected(
    booking_id: UUID, bot: Bot | None, db: AsyncSession, *, reason: str | None = None
) -> None:
    if bot is None:
        return
    b = await db.get(Booking, booking_id)
    if b is None:
        return
    client = await db.get(Client, b.client_id)
    if client is None or not client.tg_user_id:
        return
    svc = await db.get(Service, b.service_id)
    lang = client.lang or "ru"
    reason_labels = {"ru": "Причина", "en": "Reason", "uk": "Причина", "bg": "Причина"}
    reason_part = f"\n📝 {reason_labels.get(lang, 'Причина')}: {reason}" if reason else ""
    text = get_message(
        "booking_rejected",
        lang=lang,
        service=_svc_name(svc),
        date=format_booking_datetime(b.starts_at, lang),
        reason_part=reason_part,
    )
    try:
        await bot.send_message(chat_id=int(client.tg_user_id), text=text, parse_mode="HTML")
    except TelegramForbiddenError:
        logger.info("client tg forbidden chat_id=%s", client.tg_user_id)
        try:
            await record_client_blocked_after_delivered_broadcast(db, client.id)
        except Exception:  # noqa: BLE001
            logger.exception("broadcast unsubscribed bump failed booking_id=%s", booking_id)
    except Exception:  # noqa: BLE001
        logger.exception("notify_client_booking_rejected failed booking_id=%s", booking_id)


async def notify_client_booking_rescheduled(booking_id: UUID, bot: "Bot | None", db: AsyncSession) -> None:
    if bot is None:
        return
    b = await db.get(Booking, booking_id)
    if b is None:
        return
    client = await db.get(Client, b.client_id)
    if client is None or not client.tg_user_id:
        return
    m = await db.get(Master, b.master_id)
    svc = await db.get(Service, b.service_id)
    lang = client.lang or "ru"
    text = get_message(
        "booking_rescheduled",
        lang=lang,
        service=_svc_name(svc),
        master=m.display_name if m else "—",
        date=format_booking_datetime(b.starts_at, lang),
    )
    try:
        await bot.send_message(chat_id=int(client.tg_user_id), text=text, parse_mode="HTML")
    except TelegramForbiddenError:
        logger.info("client tg forbidden chat_id=%s", client.tg_user_id)
        try:
            await record_client_blocked_after_delivered_broadcast(db, client.id)
        except Exception:  # noqa: BLE001
            logger.exception("broadcast unsubscribed bump failed booking_id=%s", booking_id)
    except Exception:  # noqa: BLE001
        logger.exception("notify_client_booking_rescheduled failed booking_id=%s", booking_id)
