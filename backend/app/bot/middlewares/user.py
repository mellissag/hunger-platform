"""Автосоздание client по tg_user_id при /start и апдейтах."""

from __future__ import annotations

from typing import Any, Awaitable, Callable

from aiogram import BaseMiddleware
from aiogram.types import CallbackQuery, Message, TelegramObject, Update, User as TgUser
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.bot.utils import normalize_phone
from app.models.client import Client
from app.models.enums import ClientSource
from app.services.client_bot_activity import touch_bot_activity


def _extract_tg_user(event: TelegramObject) -> TgUser | None:
    if isinstance(event, Update):
        if event.message and event.message.from_user:
            return event.message.from_user
        if event.callback_query and event.callback_query.from_user:
            return event.callback_query.from_user
    if isinstance(event, Message):
        return event.from_user
    if isinstance(event, CallbackQuery):
        return event.from_user
    return None


def _extract_contact_phone(event: TelegramObject) -> str | None:
    if isinstance(event, Update) and event.message and event.message.contact:
        return event.message.contact.phone_number
    if isinstance(event, Message) and event.contact:
        return event.contact.phone_number
    return None


class TgUserMiddleware(BaseMiddleware):
    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        db: AsyncSession = data["db"]
        tg = _extract_tg_user(event)
        if tg is None:
            data["tg_client"] = None
            return await handler(event, data)

        row = (
            await db.execute(select(Client).where(Client.tg_user_id == tg.id))
        ).scalar_one_or_none()

        contact_phone = _extract_contact_phone(event)
        if row is None and contact_phone:
            norm = normalize_phone(contact_phone)
            if norm:
                candidates = (
                    (
                        await db.execute(
                            select(Client).where(
                                Client.tg_user_id.is_(None),
                                Client.phone.is_not(None),
                            )
                        )
                    )
                    .scalars()
                    .all()
                )
                for cand in candidates:
                    cnorm = normalize_phone(cand.phone or "")
                    if cnorm and cnorm == norm:
                        row = cand
                        row.tg_user_id = tg.id
                        if tg.username and not row.tg_username:
                            row.tg_username = tg.username
                        if tg.first_name and not row.first_name:
                            row.first_name = tg.first_name
                        if tg.last_name and not row.last_name:
                            row.last_name = tg.last_name
                        await db.flush()
                        await db.refresh(row)
                        break

        _SUPPORTED_LANGS = ("en", "ru", "uk", "bg")

        def _resolve_lang(code: str | None) -> str:
            if not code:
                return "en"
            short = code[:2].lower()
            return short if short in _SUPPORTED_LANGS else "en"

        if row is None:
            row = Client(
                tg_user_id=tg.id,
                tg_username=tg.username,
                first_name=tg.first_name,
                last_name=tg.last_name,
                lang=_resolve_lang(tg.language_code),
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
            if not row.lang and tg.language_code:
                row.lang = _resolve_lang(tg.language_code)
                changed = True
            if changed:
                await db.flush()

        touch_bot_activity(row)
        await db.flush()

        data["tg_client"] = row
        return await handler(event, data)
