"""Обновление полей клиента при активности в Telegram-боте."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.models.client import Client


def bump_client_funnel(client: Client, key: str, *, delta: int = 1) -> None:
    raw = client.funnel_stats
    base: dict[str, Any] = dict(raw) if isinstance(raw, dict) else {}
    base[key] = int(base.get(key, 0)) + delta
    client.funnel_stats = base


def touch_bot_activity(client: Client) -> None:
    """Любое входящее событие от пользователя в боте."""
    client.last_bot_activity_at = datetime.now(tz=UTC)
    if client.bot_blocked:
        client.bot_blocked = False


def on_command_start_session(client: Client) -> None:
    """Команда /start: первый визит в бота и счётчик сессий."""
    now = datetime.now(tz=UTC)
    if client.joined_bot_at is None:
        client.joined_bot_at = now
    client.total_bot_sessions = int(client.total_bot_sessions or 0) + 1
    client.last_bot_activity_at = now
