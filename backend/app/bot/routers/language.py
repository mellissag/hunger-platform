"""Сохранение языка и экран выбора из меню."""

from __future__ import annotations

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message
from sqlalchemy.ext.asyncio import AsyncSession

from app.bot.fluent_i18n import FALLBACK, LOCALES, format_message
from app.bot.keyboards.language import language_keyboard
from app.bot.keyboards.main_menu import main_menu_keyboard
from app.bot.states import LanguageStates, MainStates
from app.models.client import Client
from app.bot.salon_context import get_ai_enabled

router = Router(name="language")


@router.callback_query(F.data.startswith("lang:set:"))
async def cb_set_language(
    query: CallbackQuery,
    db: AsyncSession,
    tg_client: Client,
    state: FSMContext,
) -> None:
    await query.answer()
    code = query.data.split(":")[-1]
    if code not in LOCALES:
        code = FALLBACK
    tg_client.lang = code
    await db.flush()

    locale = code
    await state.set_state(MainStates.menu)
    ai_enabled = await get_ai_enabled(db)
    await query.message.edit_text(
        format_message(locale, "menu-greeting", {"name": query.from_user.first_name or ""}),
        reply_markup=main_menu_keyboard(
            locale,
            ai_enabled=ai_enabled,
            prefers_no_ai=tg_client.prefers_no_ai,
        ),
    )


@router.callback_query(F.data == "menu:lang")
async def cb_menu_language(query: CallbackQuery, state: FSMContext) -> None:
    await query.answer()
    await state.set_state(LanguageStates.select)
    code = (query.from_user.language_code or "en")[:2] if query.from_user else "en"
    sug = code if code in ("en", "ru", "uk", "bg") else "en"
    await query.message.edit_text(
        format_message("en", "language-prompt-block"),
        reply_markup=language_keyboard(suggested=sug),
    )


@router.message(LanguageStates.select, F.text)
async def ignore_text_until_lang(_message: Message) -> None:
    """Ждём callback с флагами."""
    return
