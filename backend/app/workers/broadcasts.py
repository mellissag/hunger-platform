"""Рассылка в Telegram: ~25 msg/s, retry при FloodWait (429) с backoff, stats."""

from __future__ import annotations

import asyncio
from typing import Any
from uuid import UUID

from aiogram import Bot
from aiogram.exceptions import TelegramRetryAfter
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

import app.core.clock as clock

from app.config import get_settings
from app.models.auto_trigger import AutoTrigger, TriggerLog
from app.models.booking import Booking
from app.models.broadcast import Broadcast, BroadcastRecipient
from app.models.catalog import Service
from app.models.client import Client
from app.models.enums import BroadcastRecipientStatus, BroadcastStatus

# Лимит Telegram ~30 msg/s; держим 25/s
_MSG_INTERVAL = 1.0 / 25.0
_FETCH_BATCH = 50


def _pick_message(message_i18n: dict[str, Any], lang: str) -> str:
    if not message_i18n:
        return ""
    if lang in message_i18n and message_i18n[lang]:
        return str(message_i18n[lang])
    if "en" in message_i18n and message_i18n["en"]:
        return str(message_i18n["en"])
    for _k, v in message_i18n.items():
        if v:
            return str(v)
    return ""


def _reply_markup(data: dict[str, Any] | None) -> InlineKeyboardMarkup | None:
    if not data:
        return None
    rows_raw = data.get("rows")
    if not rows_raw:
        return None
    rows: list[list[InlineKeyboardButton]] = []
    for row in rows_raw:
        btns: list[InlineKeyboardButton] = []
        for b in row:
            if b.get("url"):
                btns.append(InlineKeyboardButton(text=str(b["text"]), url=str(b["url"])))
            elif b.get("callback_data"):
                btns.append(
                    InlineKeyboardButton(
                        text=str(b["text"]),
                        callback_data=str(b["callback_data"])[:64],
                    )
                )
        if btns:
            rows.append(btns)
    if not rows:
        return None
    return InlineKeyboardMarkup(inline_keyboard=rows)


async def _send_with_retry(
    bot: Bot,
    *,
    chat_id: int,
    text: str,
    media_url: str | None,
    media_type: str | None,
    reply_markup: InlineKeyboardMarkup | None,
) -> None:
    attempt = 0
    while True:
        try:
            if media_url:
                if media_type == "video":
                    await bot.send_video(
                        chat_id,
                        media_url,
                        caption=text or None,
                        reply_markup=reply_markup,
                    )
                elif media_type == "animation":
                    await bot.send_animation(
                        chat_id,
                        media_url,
                        caption=text or None,
                        reply_markup=reply_markup,
                    )
                elif media_type == "video_note":
                    # Video notes (round messages) don't support captions or reply_markup
                    await bot.send_video_note(chat_id, media_url)
                    if text:
                        await bot.send_message(chat_id, text, reply_markup=reply_markup)
                elif media_type == "voice":
                    await bot.send_voice(
                        chat_id,
                        media_url,
                        caption=text or None,
                        reply_markup=reply_markup,
                    )
                else:  # photo (default)
                    await bot.send_photo(
                        chat_id,
                        media_url,
                        caption=text or None,
                        reply_markup=reply_markup,
                    )
            else:
                await bot.send_message(chat_id, text, reply_markup=reply_markup)
            return
        except TelegramRetryAfter as exc:
            base = float(exc.retry_after)
            extra = min(60.0, (2 ** min(attempt, 10)) * 0.25)
            wait = base + extra
            attempt += 1
            logger.warning(
                "telegram flood control (429): sleep {:.2f}s (attempt {})",
                wait,
                attempt,
            )
            await asyncio.sleep(wait)


async def send_broadcast(ctx: dict[str, Any], broadcast_id: str) -> None:
    """Отправить рассылку: не более 25 сообщений/с, обновление broadcast_recipient и stats."""
    app_settings = get_settings()
    if not app_settings.telegram_bot_token:
        logger.error("send_broadcast: TELEGRAM_BOT_TOKEN missing")
        return

    bid = UUID(broadcast_id)
    factory = ctx["db"]

    async with factory() as session:
        bc = await session.get(Broadcast, bid)
        if bc is None:
            logger.error("send_broadcast: broadcast {} not found", bid)
            return
        if bc.status not in (BroadcastStatus.scheduled, BroadcastStatus.sending):
            logger.warning("send_broadcast: skip status={}", bc.status)
            return
        msg_i18n: dict[str, Any] = dict(bc.message_i18n or {})
        media_url: str | None = bc.media_url
        media_type: str | None = bc.media_type
        inline_raw: dict[str, Any] | None = (
            dict(bc.inline_keyboard) if bc.inline_keyboard else None
        )
        markup = _reply_markup(inline_raw)
        bc.status = BroadcastStatus.sending
        await session.commit()

    bot = Bot(token=app_settings.telegram_bot_token)
    try:
        while True:
            async with factory() as session:
                pending = (
                    await session.execute(
                        select(BroadcastRecipient, Client)
                        .join(Client, BroadcastRecipient.client_id == Client.id)
                        .where(
                            BroadcastRecipient.broadcast_id == bid,
                            BroadcastRecipient.sent_at.is_(None),
                        )
                        .limit(_FETCH_BATCH)
                    )
                ).all()

                if not pending:
                    fin = await session.get(Broadcast, bid)
                    if fin:
                        fin.status = BroadcastStatus.sent
                        fin.sent_at = clock.utc_now()
                    await session.commit()
                    break

                snapshot: list[
                    tuple[UUID, UUID, int | None, str, str | None]
                ] = []
                for rec, client in pending:
                    lang = (client.lang or "en").split("-")[0].lower()
                    if lang not in ("en", "ru", "uk", "bg"):
                        lang = "en"
                    txt = _pick_message(msg_i18n, lang)
                    if not txt.strip():
                        snapshot.append((bid, client.id, None, "", "empty message"))
                        continue
                    if client.tg_user_id is None:
                        snapshot.append((bid, client.id, None, "", "no telegram id"))
                        continue
                    snapshot.append((bid, client.id, int(client.tg_user_id), txt, None))
                await session.commit()

            for b_id, c_id, tg_id, txt, fail_reason in snapshot:
                if fail_reason:
                    async with factory() as session:
                        rec = await session.get(BroadcastRecipient, (b_id, c_id))
                        if rec and rec.sent_at is None:
                            rec.status = BroadcastRecipientStatus.failed
                            rec.error = fail_reason
                            rec.sent_at = clock.utc_now()
                            await _bump_stats_locked(session, b_id, failed_delta=1)
                            await session.commit()
                    await asyncio.sleep(_MSG_INTERVAL)
                    continue

                assert tg_id is not None
                try:
                    await _send_with_retry(
                        bot,
                        chat_id=tg_id,
                        text=txt,
                        media_url=media_url,
                        media_type=media_type,
                        reply_markup=markup,
                    )
                except Exception as exc:
                    logger.exception("broadcast to client {} failed: {}", c_id, exc)
                    async with factory() as session:
                        rec = await session.get(BroadcastRecipient, (b_id, c_id))
                        if rec and rec.sent_at is None:
                            rec.status = BroadcastRecipientStatus.failed
                            rec.error = str(exc)[:500]
                            rec.sent_at = clock.utc_now()
                            await _bump_stats_locked(session, b_id, failed_delta=1)
                            await session.commit()
                else:
                    async with factory() as session:
                        rec = await session.get(BroadcastRecipient, (b_id, c_id))
                        if rec and rec.sent_at is None:
                            rec.status = BroadcastRecipientStatus.delivered
                            rec.error = None
                            rec.sent_at = clock.utc_now()
                            await _bump_stats_locked(
                                session, b_id, sent_delta=1, delivered_delta=1
                            )
                            await session.commit()
                await asyncio.sleep(_MSG_INTERVAL)

    finally:
        await bot.session.close()


async def _bump_stats_locked(
    session: AsyncSession,
    broadcast_id: UUID,
    *,
    sent_delta: int = 0,
    delivered_delta: int = 0,
    failed_delta: int = 0,
) -> None:
    bc = await session.get(Broadcast, broadcast_id, with_for_update=True)
    if bc is None:
        return
    stats = dict(bc.stats or {})
    if sent_delta:
        stats["sent"] = int(stats.get("sent", 0)) + sent_delta
    if delivered_delta:
        stats["delivered"] = int(stats.get("delivered", 0)) + delivered_delta
    if failed_delta:
        stats["failed"] = int(stats.get("failed", 0)) + failed_delta
    bc.stats = stats


def _render_trigger_text(
    trigger: AutoTrigger,
    booking: Booking,
    client: Client,
    service_name: str,
) -> str:
    master_name = booking.master.display_name if booking.master else ""
    date_text = booking.starts_at.strftime("%Y-%m-%d %H:%M")
    text = trigger.template_text
    return (
        text.replace("{name}", client.first_name or "")
        .replace("{имя}", client.first_name or "")
        .replace("{master}", master_name)
        .replace("{мастер}", master_name)
        .replace("{service}", service_name)
        .replace("{услуга}", service_name)
        .replace("{date}", date_text)
        .replace("{дата}", date_text)
    )


def _build_simple_keyboard(buttons: list[dict[str, str]] | None) -> InlineKeyboardMarkup | None:
    if not buttons:
        return None
    rows: list[list[InlineKeyboardButton]] = []
    for btn in buttons[:3]:
        txt = str(btn.get("text") or "").strip()
        url = str(btn.get("url") or "").strip()
        if txt and url:
            rows.append([InlineKeyboardButton(text=txt, url=url)])
    if not rows:
        return None
    return InlineKeyboardMarkup(inline_keyboard=rows)


async def fire_post_visit_trigger(ctx: dict[str, Any], booking_id: str) -> None:
    """Отправляет пост-визитный триггер после completed booking."""
    app_settings = get_settings()
    if not app_settings.telegram_bot_token:
        logger.warning("post-visit trigger skipped: TELEGRAM_BOT_TOKEN missing")
        return

    bid = UUID(booking_id)
    factory = ctx["db"]

    async with factory() as session:
        booking = (
            await session.execute(
                select(Booking)
                .options(
                    joinedload(Booking.client),
                    joinedload(Booking.master),
                )
                .where(Booking.id == bid)
            )
        ).scalar_one_or_none()
        if booking is None:
            return
        client = booking.client
        if client is None or client.tg_user_id is None:
            return

        already = (
            await session.execute(
                select(TriggerLog.id).where(
                    TriggerLog.booking_id == bid,
                    TriggerLog.status == "sent",
                )
            )
        ).scalar_one_or_none()
        if already is not None:
            return

        trigger = (
            await session.execute(
                select(AutoTrigger).where(
                    AutoTrigger.type == "post_visit",
                    AutoTrigger.is_active.is_(True),
                    AutoTrigger.master_id == booking.master_id,
                )
            )
        ).scalar_one_or_none()
        if trigger is None:
            trigger = (
                await session.execute(
                    select(AutoTrigger).where(
                        AutoTrigger.type == "post_visit",
                        AutoTrigger.is_active.is_(True),
                        AutoTrigger.master_id.is_(None),
                    )
                )
            ).scalar_one_or_none()
        if trigger is None:
            return

        service_name = ""
        service = await session.get(Service, booking.service_id)
        if service is not None:
            lang = (client.lang or "en").split("-")[0].lower()
            service_name = (
                (service.name_i18n or {}).get(lang)
                or (service.name_i18n or {}).get("en")
                or ""
            )
        text = _render_trigger_text(trigger, booking, client, service_name)
        keyboard = _build_simple_keyboard(trigger.buttons or [])

    bot = Bot(token=app_settings.telegram_bot_token)
    try:
        if trigger.photo_url:
            await bot.send_photo(
                int(client.tg_user_id),
                photo=trigger.photo_url,
                caption=text,
                reply_markup=keyboard,
            )
        else:
            await bot.send_message(
                int(client.tg_user_id),
                text,
                reply_markup=keyboard,
            )
        async with factory() as session:
            session.add(
                TriggerLog(
                    trigger_id=trigger.id,
                    client_id=client.id,
                    booking_id=bid,
                    status="sent",
                )
            )
            await session.commit()
    except Exception as exc:
        async with factory() as session:
            session.add(
                TriggerLog(
                    trigger_id=trigger.id if trigger else None,
                    client_id=client.id,
                    booking_id=bid,
                    status="error",
                    error_reason=str(exc)[:200],
                )
            )
            await session.commit()
        logger.exception("post-visit trigger failed for {}", bid)
    finally:
        await bot.session.close()
