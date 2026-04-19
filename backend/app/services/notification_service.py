"""Уведомления администратора в Telegram (settings.admin_notify_chat_id)."""

from __future__ import annotations

from enum import StrEnum
from typing import Any

from loguru import logger


class AdminEvent(StrEnum):
    new_booking = "new_booking"
    late_cancel = "late_cancel"
    blacklist_attempt = "blacklist_attempt"
    bad_ai_answer = "bad_ai_answer"
    payment_ok = "payment_ok"
    payment_fail = "payment_fail"


_ICONS: dict[AdminEvent, str] = {
    AdminEvent.new_booking: "🟢",
    AdminEvent.late_cancel: "🔴",
    AdminEvent.blacklist_attempt: "⚠️",
    AdminEvent.bad_ai_answer: "👎",
    AdminEvent.payment_ok: "💳",
    AdminEvent.payment_fail: "💔",
}


def _build_text(event: AdminEvent, payload: dict[str, Any], app_domain: str) -> str:
    icon = _ICONS.get(event, "•")
    lines = [f"{icon} *{event.value.replace('_', ' ').title()}*"]
    for k, v in payload.items():
        if v is not None:
            lines.append(f"• *{k}*: {v}")
    if app_domain:
        lines.append(f"\n[Открыть в админке](https://{app_domain})")
    return "\n".join(lines)


async def notify_admin(
    bot: Any,
    *,
    admin_chat_id: str | None,
    event: AdminEvent,
    app_domain: str = "",
    **payload: Any,
) -> None:
    """Send admin notification if admin_chat_id is configured.

    ``bot`` is an ``aiogram.Bot`` instance. Passed as ``Any`` to avoid
    importing aiogram at module level in places that don't have it.
    """
    if not admin_chat_id or bot is None:
        return
    text = _build_text(event, payload, app_domain)
    try:
        await bot.send_message(
            chat_id=admin_chat_id,
            text=text,
            parse_mode="Markdown",
        )
    except Exception as exc:
        logger.warning("notify_admin: failed to send", event=event, error=str(exc))


async def get_admin_notify_chat_id(db: Any) -> str | None:
    """Fetch admin_notify_chat_id from Settings (returns None if unset)."""
    from sqlalchemy import select

    from app.models.salon import Settings

    row = (await db.execute(select(Settings.admin_notify_chat_id).limit(1))).first()
    if not row:
        return None
    return row[0]
