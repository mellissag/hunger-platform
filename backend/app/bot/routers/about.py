"""О салоне."""

from __future__ import annotations

from aiogram import F, Router
from aiogram.types import CallbackQuery
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.bot.fluent_i18n import format_message
from app.bot.keyboards.common import nav_keyboard
from app.models.salon import Salon

router = Router(name="about")


@router.callback_query(F.data == "menu:about")
async def cb_about(query: CallbackQuery, db: AsyncSession, locale: str) -> None:
    await query.answer()
    salon = (await db.execute(select(Salon).limit(1))).scalar_one_or_none()
    if salon is None:
        await query.message.answer(format_message(locale, "error-generic"))
        return
    desc = salon.description or {}
    phone = str(desc.get("phone") or desc.get("contact_phone") or "—")
    addr = str(desc.get("address") or "—")
    lines = [
        format_message(locale, "about-title", {"name": salon.name}),
        format_message(locale, "about-address", {"address": addr}),
        format_message(locale, "about-phone", {"phone": phone}),
        format_message(locale, "about-currency", {"currency": salon.currency}),
    ]
    await query.message.edit_text(
        "\n".join(lines),
        reply_markup=nav_keyboard(locale, back_cb=None),
    )
