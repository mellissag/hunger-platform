"""Команда /start — постоянная WebApp-кнопка вместо поля ввода."""

from __future__ import annotations

from aiogram import Router
from aiogram.filters import CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.types import Message, ReplyKeyboardRemove
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.client import Client
from app.models.master import Master
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

    master_row = (
        await db.execute(select(Master).where(Master.tg_user_id == message.from_user.id))
    ).scalar_one_or_none()
    if master_row is not None:
        await message.answer(
            f"Здравствуйте, {master_row.display_name}!\n"
            f"Вы зарегистрированы как мастер. "
            f"Через этот бот вы будете получать уведомления о новых записях."
        )
        return

    # Remove any old persistent reply keyboard; the blue "Открыть салон"
    # ChatMenuButton (set in main.py via set_chat_menu_button) is the only
    # launcher we want to show.
    await message.answer(WELCOME_TEXT, parse_mode="HTML", reply_markup=ReplyKeyboardRemove())
