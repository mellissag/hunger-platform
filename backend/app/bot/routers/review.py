"""Сценарий отзыва после визита (§6 BOT_FLOWS)."""

from __future__ import annotations

import uuid

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.bot.fluent_i18n import format_message
from app.bot.keyboards.main_menu import main_menu_keyboard
from app.bot.salon_context import get_ai_enabled, get_mini_app_enabled, get_mini_app_url
from app.bot.states import ReviewStates
from app.models.booking import Booking, Review
from app.models.client import Client
from app.services.master_phase20 import recalc_master_rating

router = Router(name="review")

_STAR_MAP = {
    "review:1": 1,
    "review:2": 2,
    "review:3": 3,
    "review:4": 4,
    "review:5": 5,
}


# ─── Stars callback ────────────────────────────────────────────────────────────


@router.callback_query(F.data.startswith("review:") & F.data.regexp(r"^review:\d$"))
async def cb_review_stars(
    query: CallbackQuery,
    db: AsyncSession,
    tg_client: Client,
    locale: str,
    state: FSMContext,
) -> None:
    await query.answer()
    rating = _STAR_MAP.get(query.data)
    if rating is None:
        return

    data = await state.get_data()
    booking_id_raw = data.get("review_booking_id")
    if not booking_id_raw:
        await query.message.answer(format_message(locale, "error-generic"))
        return

    await state.update_data(review_rating=rating)
    await state.set_state(ReviewStates.await_comment)

    await query.message.edit_text(
        format_message(locale, "review-comment-prompt"),
        reply_markup=_skip_keyboard(locale),
    )


@router.callback_query(F.data == "review:skip")
async def cb_review_skip(
    query: CallbackQuery,
    db: AsyncSession,
    tg_client: Client,
    locale: str,
    state: FSMContext,
) -> None:
    await query.answer()
    await _save_review(query=query, db=db, tg_client=tg_client, locale=locale, state=state, comment=None)


@router.message(ReviewStates.await_comment)
async def msg_review_comment(
    message: Message,
    db: AsyncSession,
    tg_client: Client,
    locale: str,
    state: FSMContext,
) -> None:
    comment = (message.text or "").strip()[:1000] or None
    await _save_review(message=message, db=db, tg_client=tg_client, locale=locale, state=state, comment=comment)


# ─── Helpers ───────────────────────────────────────────────────────────────────


async def _save_review(
    *,
    db: AsyncSession,
    tg_client: Client,
    locale: str,
    state: FSMContext,
    comment: str | None,
    query: CallbackQuery | None = None,
    message: Message | None = None,
) -> None:
    data = await state.get_data()
    booking_id_raw = data.get("review_booking_id")
    rating = data.get("review_rating")
    if not booking_id_raw or not rating:
        target = query or message
        if target:
            await target.answer(format_message(locale, "error-generic"))  # type: ignore[union-attr]
        await state.clear()
        return

    booking_id = uuid.UUID(booking_id_raw)

    booking = (
        await db.execute(
            select(Booking).where(Booking.id == booking_id, Booking.client_id == tg_client.id)
        )
    ).scalar_one_or_none()

    if booking is None or booking.review is not None:
        await state.clear()
        if query:
            await query.message.answer(format_message(locale, "error-generic"))
        elif message:
            await message.answer(format_message(locale, "error-generic"))
        return

    review = Review(
        booking_id=booking_id,
        client_id=tg_client.id,
        master_id=booking.master_id,
        rating=rating,
        comment=comment,
        source="bot",
        is_visible=True,
    )
    db.add(review)
    await db.flush()
    await recalc_master_rating(db, booking.master_id)
    await db.commit()
    await state.clear()

    send = (query.message if query else message)
    if send is not None:
        ai_enabled = await get_ai_enabled(db)
        mini_app_enabled = await get_mini_app_enabled(db)
        mini_app_url = await get_mini_app_url(db) if mini_app_enabled else None
        await send.answer(
            format_message(locale, "review-thanks"),
            reply_markup=main_menu_keyboard(
                locale,
                ai_enabled=ai_enabled,
                prefers_no_ai=tg_client.prefers_no_ai,
                mini_app_url=mini_app_url,
            ),
        )


def _skip_keyboard(locale: str):
    from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=format_message(locale, "review-skip-btn"),
                    callback_data="review:skip",
                )
            ]
        ]
    )


def review_stars_keyboard(locale: str, booking_id: uuid.UUID):
    """Keyboard for rating selection — used by reminder worker."""
    from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

    stars_row = [
        InlineKeyboardButton(text=f"{'★' * i}", callback_data=f"review:{i}")
        for i in range(1, 6)
    ]
    skip_row = [
        InlineKeyboardButton(text=format_message(locale, "review-skip-btn"), callback_data="review:skip")
    ]
    return InlineKeyboardMarkup(inline_keyboard=[stars_row, skip_row])
