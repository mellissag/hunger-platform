"""Локаль из client.lang."""

from __future__ import annotations

from typing import Any, Awaitable, Callable

from aiogram import BaseMiddleware
from aiogram.types import TelegramObject

from app.bot.fluent_i18n import FALLBACK, LOCALES
from app.models.client import Client


class LocaleMiddleware(BaseMiddleware):
    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        c: Client | None = data.get("tg_client")
        lang = (c.lang or "").strip() if c else ""
        data["locale"] = lang if lang in LOCALES else FALLBACK
        return await handler(event, data)
