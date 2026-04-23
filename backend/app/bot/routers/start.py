"""Команда /start — постоянная WebApp-кнопка вместо поля ввода."""

from __future__ import annotations

from aiogram import Router
from aiogram.filters import CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.types import KeyboardButton, Message, ReplyKeyboardMarkup, WebAppInfo
from sqlalchemy.ext.asyncio import AsyncSession

from app.bot.salon_context import get_mini_app_url
from app.models.client import Client
from app.services.client_bot_activity import on_command_start_session

router = Router(name="start")

WELCOME_TEXT = (
    "✨ Welcome to <b>Hunger Beauty</b>!\n\n"
    "Book appointments, chat with our AI consultant, and manage your visits — "
    "all in one place.\n\n"
    "Tap the button below to open the app 👇"
)


@router.message(CommandStart())
async def cmd_start(
    message: Message,
    db: AsyncSession,
    tg_client: Client,
    locale: str,
    state: FSMContext,
) -> None:
    await state.clear()
    on_command_start_session(tg_client)
    await db.flush()
    mini_app_url = await get_mini_app_url(db)

    # ReplyKeyboardMarkup with is_persistent=True replaces the text input field
    # with a permanent "Open App" button that also appears in the chat list preview.
    kb = ReplyKeyboardMarkup(
        keyboard=[[
            KeyboardButton(
                text="🚀  Open App",
                web_app=WebAppInfo(url=mini_app_url),
            )
        ]],
        resize_keyboard=True,
        is_persistent=True,
    )
    await message.answer(WELCOME_TEXT, parse_mode="HTML", reply_markup=kb)
