"""Команда /start и главное меню."""

from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message
from sqlalchemy.ext.asyncio import AsyncSession

from app.bot.fluent_i18n import format_message
from app.bot.keyboards.language import language_keyboard
from app.bot.keyboards.main_menu import main_menu_keyboard
from app.bot.salon_context import get_ai_enabled
from app.bot.states import LanguageStates, MainStates
from app.models.client import Client

router = Router(name="start")


@router.message(CommandStart())
async def cmd_start(
    message: Message,
    db: AsyncSession,
    tg_client: Client,
    locale: str,
    state: FSMContext,
) -> None:
    await state.clear()
    lang = (tg_client.lang or "").strip()
    if not lang:
        await state.set_state(LanguageStates.select)
        code = (message.from_user.language_code or "en")[:2] if message.from_user else "en"
        sug = code if code in ("en", "ru", "uk", "bg") else "en"
        await message.answer(
            format_message("en", "language-prompt-block"),
            reply_markup=language_keyboard(suggested=sug),
        )
        return

    ai_enabled = await get_ai_enabled(db)
    await state.set_state(MainStates.menu)
    await message.answer(
        format_message(locale, "menu-greeting", {"name": message.from_user.first_name or ""}),
        reply_markup=main_menu_keyboard(
            locale,
            ai_enabled=ai_enabled,
            prefers_no_ai=tg_client.prefers_no_ai,
        ),
    )


@router.callback_query(F.data == "menu:main")
async def cb_main_menu(
    query: CallbackQuery,
    db: AsyncSession,
    tg_client: Client,
    locale: str,
    state: FSMContext,
) -> None:
    await query.answer()
    lang = (tg_client.lang or "").strip()
    if not lang:
        await state.set_state(LanguageStates.select)
        code = (query.from_user.language_code or "en")[:2] if query.from_user else "en"
        sug = code if code in ("en", "ru", "uk", "bg") else "en"
        await query.message.answer(
            format_message("en", "language-prompt-block"),
            reply_markup=language_keyboard(suggested=sug),
        )
        return

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
