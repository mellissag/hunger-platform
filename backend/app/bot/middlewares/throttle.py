"""Не чаще 1 сообщения / 500 мс на пользователя (02_BOT_FLOWS §0)."""

from __future__ import annotations

import time
from typing import Any, Awaitable, Callable

from aiogram import BaseMiddleware
from aiogram.types import CallbackQuery, Message, TelegramObject, Update
from loguru import logger

_INTERVAL_MS = 500
_last: dict[int, float] = {}


class ThrottleMiddleware(BaseMiddleware):
    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        uid: int | None = None
        if isinstance(event, Update):
            if event.message and event.message.from_user:
                uid = event.message.from_user.id
            elif event.callback_query and event.callback_query.from_user:
                uid = event.callback_query.from_user.id
        elif isinstance(event, Message) and event.from_user:
            uid = event.from_user.id
        elif isinstance(event, CallbackQuery) and event.from_user:
            uid = event.from_user.id
        if uid is None:
            return await handler(event, data)

        now = time.monotonic() * 1000.0
        prev = _last.get(uid, 0.0)
        if now - prev < _INTERVAL_MS:
            logger.debug("throttle_skip user={}", uid)
            if isinstance(event, CallbackQuery):
                await event.answer()
            return None
        _last[uid] = now
        return await handler(event, data)
