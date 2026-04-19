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

import app.core.clock as clock

from app.config import get_settings
from app.models.broadcast import Broadcast, BroadcastRecipient
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
                        caption=text,
                        reply_markup=reply_markup,
                    )
                else:
                    await bot.send_photo(
                        chat_id,
                        media_url,
                        caption=text,
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
