"""Мои записи: список, карточка, отмена."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup

from sqlalchemy.ext.asyncio import AsyncSession

from app.bot.fluent_i18n import format_message
from app.bot.keyboards.common import confirm_keyboard, nav_keyboard
from app.bot.states import MyBookingsStates
from app.bot.utils import pick_i18n
from app.core.exceptions import LateCancellationDeniedError
from app.models.booking import Booking
from app.models.catalog import Service
from app.models.client import Client
from app.models.enums import BookingStatus
from app.models.master import Master
from app.services.bot_booking import cancel_tg_booking, list_client_bookings

router = Router(name="my_bookings")


def _active(b: Booking) -> bool:
    return b.status in (BookingStatus.pending, BookingStatus.confirmed)


@router.callback_query(F.data == "menu:my")
async def cb_list(
    query: CallbackQuery,
    db: AsyncSession,
    tg_client: Client,
    locale: str,
    state: FSMContext,
) -> None:
    await query.answer()
    await state.set_state(MyBookingsStates.list_)
    rows = await list_client_bookings(db, tg_client.id)
    now = datetime.now(tz=UTC)
    future = sorted([b for b in rows if b.starts_at >= now and _active(b)], key=lambda x: x.starts_at)
    past = sorted([b for b in rows if b.starts_at < now or not _active(b)], key=lambda x: x.starts_at, reverse=True)
    show = future + past[:3]
    if not show:
        await query.message.edit_text(
            format_message(locale, "my-bookings-empty"),
            reply_markup=nav_keyboard(locale, back_cb="menu:main"),
        )
        return

    kb_rows: list[list[InlineKeyboardButton]] = []
    for b in show:
        svc = await db.get(Service, b.service_id)
        title = pick_i18n(svc.name_i18n if svc else {}, locale) if svc else "—"
        kb_rows.append(
            [
                InlineKeyboardButton(
                    text=f"{b.starts_at.astimezone(UTC).strftime('%d.%m %H:%M')} · {title[:24]}",
                    callback_data=f"my:card:{b.id}",
                )
            ]
        )
    kb_rows.extend(nav_keyboard(locale, back_cb="menu:main").inline_keyboard)
    await query.message.edit_text(
        format_message(locale, "my-bookings-title"),
        reply_markup=InlineKeyboardMarkup(inline_keyboard=kb_rows),
    )


@router.callback_query(F.data.startswith("my:card:"))
async def cb_card(
    query: CallbackQuery,
    db: AsyncSession,
    tg_client: Client,
    locale: str,
    state: FSMContext,
) -> None:
    await query.answer()
    bid = UUID(query.data.split(":")[-1])
    b = await db.get(Booking, bid)
    if b is None or b.client_id != tg_client.id:
        await query.message.answer(format_message(locale, "error-not-found"))
        return

    m = await db.get(Master, b.master_id)
    svc = await db.get(Service, b.service_id)
    master_name = m.display_name if m else "—"
    svc_name = pick_i18n(svc.name_i18n if svc else {}, locale)
    txt = format_message(
        locale,
        "booking-card",
        {
            "service": svc_name,
            "master": master_name,
            "starts": b.starts_at.astimezone(UTC).strftime("%Y-%m-%d %H:%M"),
            "price": str(b.price),
            "status": b.status.value,
        },
    )
    await state.set_state(MyBookingsStates.card)
    rows: list[list[InlineKeyboardButton]] = []
    if _active(b) and b.starts_at > datetime.now(tz=UTC):
        rows.append(
            [
                InlineKeyboardButton(
                    text=format_message(locale, "booking-reschedule"),
                    callback_data=f"my:resched:{b.id}",
                ),
            ]
        )
        rows.append(
            [
                InlineKeyboardButton(
                    text=format_message(locale, "booking-cancel"),
                    callback_data=f"my:cancelask:{b.id}",
                ),
            ]
        )
    rows.extend(nav_keyboard(locale, back_cb="menu:my").inline_keyboard)
    await query.message.edit_text(txt, reply_markup=InlineKeyboardMarkup(inline_keyboard=rows))


@router.callback_query(F.data.startswith("my:cancelask:"))
async def cb_cancel_ask(query: CallbackQuery, locale: str, state: FSMContext) -> None:
    await query.answer()
    await state.set_state(MyBookingsStates.cancel_confirm)
    bid = query.data.split(":")[-1]
    await state.update_data(cancel_bid=bid)
    await query.message.edit_text(
        format_message(locale, "cancel-confirm"),
        reply_markup=confirm_keyboard(locale, f"my:cx:{bid}"),
    )


@router.callback_query(MyBookingsStates.cancel_confirm, F.data.startswith("my:cx:"))
async def cb_cancel_do(
    query: CallbackQuery,
    db: AsyncSession,
    tg_client: Client,
    locale: str,
    state: FSMContext,
) -> None:
    await query.answer()
    parts = query.data.split(":", 3)
    bid_s = parts[2]
    action = parts[3] if len(parts) > 3 else ""
    if action == "no":
        await state.clear()
        await query.message.edit_text(
            format_message(locale, "cancel-aborted"),
            reply_markup=nav_keyboard(locale, back_cb="menu:main"),
        )
        return
    if action != "yes":
        return
    bid = UUID(bid_s)
    try:
        await cancel_tg_booking(db, client_id=tg_client.id, booking_id=bid, reason="client via bot")
    except LateCancellationDeniedError:
        await query.message.answer(format_message(locale, "cancel-too-late"))
        await state.clear()
        return
    await state.clear()
    await query.message.edit_text(
        format_message(locale, "cancel-success"),
        reply_markup=nav_keyboard(locale, back_cb="menu:main"),
    )


@router.callback_query(F.data.startswith("my:resched:"))
async def cb_resched(
    query: CallbackQuery,
    db: AsyncSession,
    locale: str,
    state: FSMContext,
) -> None:
    """Перенос: переходим в сценарий выбора даты в booking router."""
    await query.answer()
    bid = UUID(query.data.split(":")[-1])
    b = await db.get(Booking, bid)
    if b is None or not _active(b):
        await query.message.answer(format_message(locale, "error-not-found"))
        return
    from app.bot.states import BookingStates

    await state.set_state(BookingStates.pick_date)
    await state.update_data(
        mode="reschedule",
        reschedule_booking_id=str(b.id),
        master_id=str(b.master_id),
        service_id=str(b.service_id),
    )
    from app.bot.calendar_ui import show_date_calendar

    await show_date_calendar(query.message, db, state, locale)
