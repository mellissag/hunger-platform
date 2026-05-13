"""Аналитика рассылок: stats JSON, инъекция broadcast_id в callback_data, бампы счётчиков."""

from __future__ import annotations

import copy
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from aiogram.exceptions import TelegramBadRequest, TelegramForbiddenError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import app.core.clock as clock

from app.models.booking import Booking
from app.models.broadcast import Broadcast, BroadcastRecipient
from app.models.enums import BookingCreatedVia, BroadcastRecipientStatus, BroadcastStatus


def broadcast_callback_token(broadcast_id: UUID) -> str:
    """Компактный токен для callback_data (≤64 байт вместе с префиксом данных)."""
    return f"B{broadcast_id.hex}"


def merge_callback_with_broadcast(callback_data: str, broadcast_id: UUID) -> str:
    token = broadcast_callback_token(broadcast_id)
    sep = "|"
    max_len = 64
    if len(token) > max_len:
        return token[:max_len]
    room = max_len - len(token) - len(sep)
    if room <= 0:
        return token[:max_len]
    prefix = (callback_data or "")[:room]
    if prefix:
        return f"{prefix}{sep}{token}"[:max_len]
    return token[:max_len]


def parse_broadcast_ids_from_callback(data: str | None) -> list[UUID]:
    """Извлекает UUID рассылок из токенов вида B<32hex> в callback_data."""
    if not data:
        return []
    out: list[UUID] = []
    i = 0
    while i < len(data):
        j = data.find("B", i)
        if j == -1:
            break
        chunk = data[j + 1 : j + 33]
        if len(chunk) == 32 and all(c in "0123456789abcdefABCDEF" for c in chunk):
            try:
                out.append(UUID(hex=chunk.lower()))
            except ValueError:
                i = j + 1
                continue
            i = j + 33
        else:
            i = j + 1
    return out


def inject_broadcast_into_inline_keyboard(
    inline_keyboard: dict[str, Any] | None,
    broadcast_id: UUID,
) -> dict[str, Any] | None:
    if not inline_keyboard:
        return inline_keyboard
    raw = copy.deepcopy(inline_keyboard)
    rows = raw.get("rows") or []
    for row in rows:
        for btn in row:
            if isinstance(btn, dict) and btn.get("callback_data"):
                btn["callback_data"] = merge_callback_with_broadcast(
                    str(btn["callback_data"]),
                    broadcast_id,
                )
    return raw


def fresh_stats_for_send(total_targeted: int) -> dict[str, Any]:
    return {
        "total_targeted": total_targeted,
        "total": total_targeted,
        "sent": 0,
        "delivered": 0,
        "failed": 0,
        "read": 0,
        "clicked": 0,
        "bot_opened": 0,
        "booking_made": 0,
        "unsubscribed": 0,
        "delivery_rate": 0.0,
        "read_rate": 0.0,
        "click_rate": 0.0,
        "booking_rate": 0.0,
        "error_details": {"blocked": 0, "deactivated": 0, "not_found": 0, "other": 0},
        "sent_duration_seconds": None,
        "completed_at": None,
        "send_started_at": None,
    }


def merge_stats_defaults(raw: dict[str, Any] | None) -> dict[str, Any]:
    base = fresh_stats_for_send(int((raw or {}).get("total_targeted") or (raw or {}).get("total") or 0))
    merged = {**base, **(raw or {})}
    merged["total_targeted"] = int(merged.get("total_targeted") or merged.get("total") or 0)
    merged["total"] = merged["total_targeted"]
    ed = dict(base["error_details"])
    ed.update((raw or {}).get("error_details") or {})
    for k in ("blocked", "deactivated", "not_found", "other"):
        ed[k] = int(ed.get(k, 0))
    merged["error_details"] = ed
    return merged


def recompute_broadcast_rates(stats: dict[str, Any]) -> None:
    tt = int(stats.get("total_targeted") or stats.get("total") or 0)
    delivered = int(stats.get("delivered") or 0)
    read = int(stats.get("read") or 0)
    clicked = int(stats.get("clicked") or 0)
    booking_made = int(stats.get("booking_made") or 0)
    stats["delivery_rate"] = round(delivered / tt * 100, 1) if tt else 0.0
    stats["read_rate"] = round(read / delivered * 100, 1) if delivered else 0.0
    stats["click_rate"] = round(clicked / delivered * 100, 1) if delivered else 0.0
    stats["booking_rate"] = round(booking_made / tt * 100, 1) if tt else 0.0


def classify_broadcast_send_error(exc: BaseException) -> str:
    msg = str(exc).lower()
    if "chat not found" in msg or "peer_id_invalid" in msg:
        return "not_found"
    if isinstance(exc, TelegramBadRequest):
        if "chat not found" in msg:
            return "not_found"
        return "other"
    if isinstance(exc, TelegramForbiddenError):
        if "user is deactivated" in msg or "deactivated" in msg:
            return "deactivated"
        if "bot was blocked" in msg or "blocked by the user" in msg:
            return "blocked"
        return "other"
    if "forbidden" in msg and "403" in msg:
        if "deactivated" in msg:
            return "deactivated"
        if "blocked" in msg:
            return "blocked"
    return "other"


async def bump_broadcast_stats(
    session: AsyncSession,
    broadcast_id: UUID,
    *,
    sent_delta: int = 0,
    delivered_delta: int = 0,
    failed_delta: int = 0,
    error_type: str | None = None,
    read_delta: int = 0,
    clicked_delta: int = 0,
    bot_opened_delta: int = 0,
    booking_made_delta: int = 0,
    unsubscribed_delta: int = 0,
) -> None:
    bc = await session.get(Broadcast, broadcast_id, with_for_update=True)
    if bc is None:
        return
    stats = merge_stats_defaults(bc.stats)
    stats["sent"] = int(stats.get("sent", 0)) + sent_delta
    stats["delivered"] = int(stats.get("delivered", 0)) + delivered_delta
    stats["failed"] = int(stats.get("failed", 0)) + failed_delta
    stats["read"] = int(stats.get("read", 0)) + read_delta
    stats["clicked"] = int(stats.get("clicked", 0)) + clicked_delta
    stats["bot_opened"] = int(stats.get("bot_opened", 0)) + bot_opened_delta
    stats["booking_made"] = int(stats.get("booking_made", 0)) + booking_made_delta
    stats["unsubscribed"] = int(stats.get("unsubscribed", 0)) + unsubscribed_delta
    if error_type and failed_delta:
        ed = dict(stats.get("error_details") or {})
        key = error_type if error_type in ("blocked", "deactivated", "not_found", "other") else "other"
        ed[key] = int(ed.get(key, 0)) + failed_delta
        stats["error_details"] = ed
    recompute_broadcast_rates(stats)
    bc.stats = stats


async def mark_send_started(session: AsyncSession, broadcast_id: UUID) -> None:
    bc = await session.get(Broadcast, broadcast_id, with_for_update=True)
    if bc is None:
        return
    stats = merge_stats_defaults(bc.stats)
    if not stats.get("send_started_at"):
        stats["send_started_at"] = clock.utc_now().isoformat().replace("+00:00", "Z")
    recompute_broadcast_rates(stats)
    bc.stats = stats


async def finalize_broadcast_send_stats(session: AsyncSession, broadcast_id: UUID) -> None:
    bc = await session.get(Broadcast, broadcast_id, with_for_update=True)
    if bc is None:
        return
    stats = merge_stats_defaults(bc.stats)
    completed = clock.utc_now()
    stats["completed_at"] = completed.isoformat().replace("+00:00", "Z")
    started_raw = stats.get("send_started_at")
    if isinstance(started_raw, str) and started_raw:
        try:
            started = datetime.fromisoformat(started_raw.replace("Z", "+00:00"))
            stats["sent_duration_seconds"] = int(max(0, (completed - started).total_seconds()))
        except (TypeError, ValueError, OSError):
            stats["sent_duration_seconds"] = None
    else:
        stats["sent_duration_seconds"] = None
    recompute_broadcast_rates(stats)
    bc.stats = stats


async def track_broadcast_engagement(
    db: AsyncSession,
    client_id: UUID,
    *,
    is_callback: bool,
    is_message: bool,
    callback_data: str | None,
) -> None:
    now = clock.utc_now()
    bids_from_cb = set(parse_broadcast_ids_from_callback(callback_data)) if is_callback else set()

    stmt = (
        select(BroadcastRecipient, Broadcast)
        .join(Broadcast, Broadcast.id == BroadcastRecipient.broadcast_id)
        .where(
            BroadcastRecipient.client_id == client_id,
            BroadcastRecipient.sent_at.is_not(None),
            BroadcastRecipient.status == BroadcastRecipientStatus.delivered,
            Broadcast.status == BroadcastStatus.sent,
            BroadcastRecipient.sent_at + timedelta(hours=48) >= now,
        )
    )
    rows = (await db.execute(stmt)).all()

    for rec, bc in rows:
        if rec.sent_at is None:
            continue

        if is_callback:
            if rec.sent_at + timedelta(hours=24) < now:
                continue
            if not bids_from_cb or bc.id not in bids_from_cb:
                continue
            if rec.clicked_at is not None:
                continue
            prior = rec.clicked_at is not None or rec.bot_opened_at is not None
            rec.clicked_at = now
            await bump_broadcast_stats(
                db,
                bc.id,
                clicked_delta=1,
                read_delta=0 if prior else 1,
            )

        if is_message:
            if rec.sent_at + timedelta(hours=24) < now:
                continue
            if rec.bot_opened_at is not None:
                continue
            read_on_msg = 1 if rec.clicked_at is None else 0
            rec.bot_opened_at = now
            await bump_broadcast_stats(db, bc.id, bot_opened_delta=1, read_delta=read_on_msg)


async def try_attribute_booking_to_broadcast(db: AsyncSession, booking: Booking) -> None:
    if booking.created_via != BookingCreatedVia.bot:
        return
    now = clock.utc_now()
    stmt = (
        select(BroadcastRecipient, Broadcast)
        .join(Broadcast, Broadcast.id == BroadcastRecipient.broadcast_id)
        .where(
            BroadcastRecipient.client_id == booking.client_id,
            BroadcastRecipient.sent_at.is_not(None),
            BroadcastRecipient.status == BroadcastRecipientStatus.delivered,
            Broadcast.status == BroadcastStatus.sent,
            BroadcastRecipient.sent_at + timedelta(hours=48) >= now,
            BroadcastRecipient.booking_id.is_(None),
        )
        .order_by(BroadcastRecipient.sent_at.desc())
        .limit(1)
    )
    row = (await db.execute(stmt)).first()
    if row is None:
        return
    rec, bc = row[0], row[1]
    booking.created_via = BookingCreatedVia.broadcast
    booking.broadcast_id = bc.id
    rec.booking_id = booking.id
    await bump_broadcast_stats(db, bc.id, booking_made_delta=1)


async def record_client_blocked_after_delivered_broadcast(db: AsyncSession, client_id: UUID) -> None:
    """403 при отправке клиенту после доставленной рассылки — отписка (один раз на получателя)."""
    now = clock.utc_now()
    stmt = (
        select(BroadcastRecipient, Broadcast)
        .join(Broadcast, Broadcast.id == BroadcastRecipient.broadcast_id)
        .where(
            BroadcastRecipient.client_id == client_id,
            BroadcastRecipient.status == BroadcastRecipientStatus.delivered,
            BroadcastRecipient.sent_at.is_not(None),
            BroadcastRecipient.sent_at + timedelta(days=30) >= now,
            BroadcastRecipient.unsubscribed_at.is_(None),
        )
        .order_by(BroadcastRecipient.sent_at.desc())
        .limit(1)
    )
    row = (await db.execute(stmt)).first()
    if row is None:
        return
    rec, bc = row[0], row[1]
    rec.unsubscribed_at = now
    await bump_broadcast_stats(db, bc.id, unsubscribed_delta=1)
