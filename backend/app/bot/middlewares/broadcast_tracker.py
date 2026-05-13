"""Трекинг взаимодействий после рассылки (клик, сообщение боту)."""

from __future__ import annotations

from typing import Any, Awaitable, Callable

from aiogram import BaseMiddleware
from aiogram.types import CallbackQuery, Message, TelegramObject, Update

from app.models.client import Client
from app.services.broadcast_analytics import track_broadcast_engagement
from sqlalchemy.ext.asyncio import AsyncSession


class BroadcastTrackerMiddleware(BaseMiddleware):
    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        db: AsyncSession | None = data.get("db")
        client: Client | None = data.get("tg_client")
        if db is not None and client is not None:
            is_callback = False
            is_message = False
            callback_data: str | None = None

            if isinstance(event, Update):
                if event.callback_query:
                    is_callback = True
                    callback_data = event.callback_query.data
                else:
                    msg = event.message or event.edited_message
                    if msg and msg.from_user and not msg.from_user.is_bot:
                        is_message = True
            elif isinstance(event, CallbackQuery):
                is_callback = True
                callback_data = event.data
            elif isinstance(event, Message):
                if event.from_user and not event.from_user.is_bot:
                    is_message = True

            if is_callback or is_message:
                await track_broadcast_engagement(
                    db,
                    client.id,
                    is_callback=is_callback,
                    is_message=is_message,
                    callback_data=callback_data,
                )

        return await handler(event, data)
