"""AI-консультант: диалог, отметка плохого ответа, отказ от AI."""

from __future__ import annotations

import uuid

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message
from sqlalchemy.ext.asyncio import AsyncSession

from app.bot.fluent_i18n import format_message
from app.bot.keyboards.main_menu import main_menu_keyboard
from app.bot.salon_context import get_ai_enabled
from app.bot.states import AIChatStates, MainStates
from app.core.exceptions import AIRateLimitError, AIUnavailableError
from app.models.ai_chat import AIConversation, AIMessage
from app.models.client import Client
from app.services.ai_service import AIService, gemini_configured

router = Router(name="ai_consult")


def _after_answer_keyboard(locale: str, assistant_message_id: uuid.UUID) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=format_message(locale, "ai-btn-book"),
                    callback_data="menu:book",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=format_message(locale, "ai-btn-bad"),
                    callback_data=f"ai:bad:{assistant_message_id}",
                ),
                InlineKeyboardButton(
                    text=format_message(locale, "ai-btn-menu"),
                    callback_data="ai:menu",
                ),
            ],
        ]
    )


@router.callback_query(F.data == "menu:no-ai")
async def cb_menu_no_ai(
    query: CallbackQuery,
    db: AsyncSession,
    tg_client: Client,
    locale: str,
    state: FSMContext,
) -> None:
    await query.answer()
    tg_client.prefers_no_ai = True
    await db.flush()
    await state.set_state(MainStates.menu)
    ai = await get_ai_enabled(db)
    await query.message.edit_text(
        format_message(locale, "menu-greeting", {"name": query.from_user.first_name or ""}),
        reply_markup=main_menu_keyboard(
            locale,
            ai_enabled=ai,
            prefers_no_ai=tg_client.prefers_no_ai,
        ),
    )


@router.callback_query(F.data == "menu:ai")
async def cb_menu_ai(
    query: CallbackQuery,
    db: AsyncSession,
    tg_client: Client,
    locale: str,
    state: FSMContext,
) -> None:
    await query.answer()
    if tg_client.prefers_no_ai:
        await query.message.answer(format_message(locale, "ai-blocked-pref"))
        return
    if not await get_ai_enabled(db):
        await query.message.answer(format_message(locale, "ai-disabled-salon"))
        return
    if not gemini_configured():
        await query.message.answer(format_message(locale, "ai-unavailable"))
        return
    await state.set_state(AIChatStates.chat)
    await query.message.answer(format_message(locale, "ai-consult-welcome"))


@router.message(AIChatStates.chat, F.text)
async def on_ai_message(
    message: Message,
    db: AsyncSession,
    tg_client: Client,
    locale: str,
    state: FSMContext,
) -> None:
    text = (message.text or "").strip()
    if not text:
        return
    if not gemini_configured():
        await message.answer(format_message(locale, "ai-unavailable"))
        return
    svc = AIService(db, None)
    try:
        answer, _cited, asst_id = await svc.ask(tg_client.id, text)
    except AIUnavailableError as exc:
        await message.answer(exc.message)
        return
    except AIRateLimitError as exc:
        await message.answer(exc.message)
        return
    except ValueError:
        return
    await message.answer(
        answer,
        reply_markup=_after_answer_keyboard(locale, asst_id),
    )


@router.callback_query(F.data.startswith("ai:bad:"))
async def cb_ai_bad(
    query: CallbackQuery,
    db: AsyncSession,
    tg_client: Client,
    locale: str,
) -> None:
    raw = query.data or ""
    try:
        mid = uuid.UUID(raw.split(":")[-1])
    except ValueError:
        await query.answer()
        return
    msg = await db.get(AIMessage, mid)
    if msg is None:
        await query.answer()
        return
    conv = await db.get(AIConversation, msg.conversation_id)
    if conv is None or conv.client_id != tg_client.id:
        await query.answer(format_message(locale, "error-not-found"), show_alert=True)
        return
    msg.flagged_negative = True
    await db.flush()
    await query.answer(format_message(locale, "ai-bad-thanks"))


@router.callback_query(F.data == "ai:menu")
async def cb_ai_back_to_menu(
    query: CallbackQuery,
    db: AsyncSession,
    tg_client: Client,
    locale: str,
    state: FSMContext,
) -> None:
    await query.answer()
    await state.set_state(MainStates.menu)
    ai = await get_ai_enabled(db)
    await query.message.edit_text(
        format_message(locale, "menu-greeting", {"name": query.from_user.first_name or ""}),
        reply_markup=main_menu_keyboard(
            locale,
            ai_enabled=ai,
            prefers_no_ai=tg_client.prefers_no_ai,
        ),
    )
