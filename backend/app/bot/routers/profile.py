"""Профиль клиента."""

from __future__ import annotations

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message
from sqlalchemy.ext.asyncio import AsyncSession

from app.bot.fluent_i18n import format_message
from app.bot.keyboards.common import nav_keyboard
from app.bot.states import ProfileStates
from app.bot.utils import normalize_phone
from app.models.client import Client

router = Router(name="profile")


def _profile_text(locale: str, c: Client) -> str:
    un = f"@{c.tg_username}" if c.tg_username else "—"
    return format_message(
        locale,
        "profile-body",
        {
            "first_name": c.first_name or "—",
            "last_name": c.last_name or "",
            "phone": c.phone or "—",
            "username": un,
            "lang": c.lang or "—",
            "visits": str(c.total_bookings),
        },
    )


def _profile_kb(locale: str) -> InlineKeyboardMarkup:
    nav = nav_keyboard(locale, back_cb=None)
    rows = [
        [
            InlineKeyboardButton(
                text=format_message(locale, "profile-edit-name"),
                callback_data="prof:edit_name",
            ),
        ],
        [
            InlineKeyboardButton(
                text=format_message(locale, "profile-edit-phone"),
                callback_data="prof:edit_phone",
            ),
        ],
    ]
    rows.extend(nav.inline_keyboard)
    return InlineKeyboardMarkup(inline_keyboard=rows)


@router.callback_query(F.data == "menu:profile")
async def cb_profile(
    query: CallbackQuery, tg_client: Client, locale: str, state: FSMContext
) -> None:
    await query.answer()
    await state.set_state(ProfileStates.view)
    await query.message.edit_text(_profile_text(locale, tg_client), reply_markup=_profile_kb(locale))


@router.callback_query(F.data == "prof:edit_name")
async def cb_edit_name(query: CallbackQuery, locale: str, state: FSMContext) -> None:
    await query.answer()
    await state.set_state(ProfileStates.edit_name)
    await query.message.answer(format_message(locale, "profile-enter-name"))


@router.message(ProfileStates.edit_name, F.text)
async def save_name(
    message: Message,
    db: AsyncSession,
    tg_client: Client,
    locale: str,
    state: FSMContext,
) -> None:
    tg_client.first_name = message.text.strip()[:120]
    await db.flush()
    await state.set_state(ProfileStates.view)
    await message.answer(_profile_text(locale, tg_client), reply_markup=_profile_kb(locale))


@router.callback_query(F.data == "prof:edit_phone")
async def cb_edit_phone(query: CallbackQuery, locale: str, state: FSMContext) -> None:
    await query.answer()
    await state.set_state(ProfileStates.edit_phone)
    await query.message.answer(format_message(locale, "profile-enter-phone"))


@router.message(ProfileStates.edit_phone, F.text)
async def save_phone(
    message: Message,
    db: AsyncSession,
    tg_client: Client,
    locale: str,
    state: FSMContext,
) -> None:
    phone = normalize_phone(message.text)
    if not phone:
        await message.answer(format_message(locale, "error-phone"))
        return
    tg_client.phone = phone
    await db.flush()
    await state.set_state(ProfileStates.view)
    await message.answer(_profile_text(locale, tg_client), reply_markup=_profile_kb(locale))
