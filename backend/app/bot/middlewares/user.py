"""Автосоздание client по tg_user_id при /start и апдейтах."""

from __future__ import annotations

from typing import Any, Awaitable, Callable

from aiogram import BaseMiddleware
from aiogram.types import CallbackQuery, Message, TelegramObject, Update, User as TgUser
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.client import Client
from app.models.enums import ClientSource


class TgUserMiddleware(BaseMiddleware):
    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        db: AsyncSession = data["db"]
        tg: TgUser | None = None
        if isinstance(event, Update):
            if event.message and event.message.from_user:
                tg = event.message.from_user
            elif event.callback_query and event.callback_query.from_user:
                tg = event.callback_query.from_user
        elif isinstance(event, Message):
            tg = event.from_user
        elif isinstance(event, CallbackQuery):
            tg = event.from_user
        if tg is None:
            data["tg_client"] = None
            return await handler(event, data)

        row = (
            await db.execute(select(Client).where(Client.tg_user_id == tg.id))
        ).scalar_one_or_none()
        if row is None:
            row = Client(
                tg_user_id=tg.id,
                tg_username=tg.username,
                first_name=tg.first_name,
                last_name=tg.last_name,
                lang="",
                source=ClientSource.bot,
            )
            db.add(row)
            await db.flush()
            await db.refresh(row)
        else:
            changed = False
            if tg.username and row.tg_username != tg.username:
                row.tg_username = tg.username
                changed = True
            if tg.first_name and row.first_name != tg.first_name:
                row.first_name = tg.first_name
                changed = True
            if tg.last_name and row.last_name != tg.last_name:
                row.last_name = tg.last_name
                changed = True
            if changed:
                await db.flush()

        data["tg_client"] = row
        return await handler(event, data)
