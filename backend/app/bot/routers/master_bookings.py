"""Обработчики кнопок подтверждения/отклонения/переноса записи для мастеров."""

from __future__ import annotations

import logging
from datetime import date, timedelta
from uuid import UUID

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.bot.states import MasterBookingStates, RescheduleStates
from app.models.booking import Booking
from app.models.catalog import Service
from app.models.client import Client
from app.models.enums import BookingStatus
from app.models.master import Master
from app.services.notifications import (
    notify_client_booking_confirmed,
    notify_client_booking_rejected,
    notify_client_booking_rescheduled,
)
from app.services.schedule_service import get_available_slots, get_schedule_context
from app.utils.datetime_utils import format_booking_datetime

logger = logging.getLogger(__name__)
router = Router(name="master_bookings")

_DAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
_MONTH_NAMES = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"]


async def _get_booking(db: AsyncSession, booking_id: UUID) -> Booking | None:
    return await db.get(Booking, booking_id)


def _booking_summary(b: Booking, svc: Service | None, client: Client | None) -> str:
    name_i18n = svc.name_i18n if svc and isinstance(svc.name_i18n, dict) else {}
    svc_name = str(name_i18n.get("ru") or name_i18n.get("en") or "—")
    cname = "—"
    if client:
        cname = " ".join(x for x in (client.first_name or "", client.last_name or "") if x).strip() or "—"
    return (
        f"\U0001f464 Клиент: {cname}\n"
        f"\U0001f487 Услуга: {svc_name}\n"
        f"\U0001f4c6 Время: {format_booking_datetime(b.starts_at, 'ru')}"
    )


# ── Подтверждение ────────────────────────────────────────────────────────────

@router.callback_query(F.data.startswith("bk:confirm:"))
async def confirm_booking_callback(callback: CallbackQuery, db: AsyncSession) -> None:
    await callback.answer()
    booking_id = UUID(callback.data.split(":", 2)[2])
    b = await _get_booking(db, booking_id)
    if b is None:
        await callback.message.answer("\u26a0\ufe0f Запись не найдена.")
        return
    if b.status != BookingStatus.pending:
        status_map = {
            BookingStatus.confirmed: "уже подтверждена",
            BookingStatus.cancelled_by_salon: "уже отменена",
            BookingStatus.cancelled_by_client: "отменена клиентом",
            BookingStatus.completed: "завершена",
        }
        label = status_map.get(b.status, b.status.value)
        await callback.message.edit_text(f"\u2139\ufe0f Запись {label}.", reply_markup=None)
        return

    b.status = BookingStatus.confirmed
    await db.flush()
    await db.commit()
    await db.refresh(b)

    svc = await db.get(Service, b.service_id)
    client = await db.get(Client, b.client_id)
    summary = _booking_summary(b, svc, client)
    await callback.message.edit_text(
        f"\u2705 <b>Запись подтверждена!</b>\n\n{summary}",
        reply_markup=None,
        parse_mode="HTML",
    )
    if callback.bot:
        await notify_client_booking_confirmed(b.id, callback.bot, db)


# ── Отклонение ───────────────────────────────────────────────────────────────

@router.callback_query(F.data.startswith("bk:reject:"))
async def reject_booking_callback(callback: CallbackQuery, state: FSMContext, db: AsyncSession) -> None:
    await callback.answer()
    booking_id = UUID(callback.data.split(":", 2)[2])
    b = await _get_booking(db, booking_id)
    if b is None:
        await callback.message.answer("\u26a0\ufe0f Запись не найдена.")
        return
    await state.update_data(booking_id=str(booking_id))
    await state.set_state(MasterBookingStates.reject_reason)
    await callback.message.answer("Укажите причину отказа или отправьте /skip чтобы пропустить:")


@router.message(MasterBookingStates.reject_reason)
async def reject_reason_received(message: Message, state: FSMContext, db: AsyncSession) -> None:
    data = await state.get_data()
    booking_id = UUID(str(data["booking_id"]))
    reason: str | None = None
    if message.text and message.text.strip() != "/skip":
        reason = message.text.strip()

    b = await _get_booking(db, booking_id)
    if b is None:
        await message.answer("\u26a0\ufe0f Запись не найдена.")
        await state.clear()
        return

    b.status = BookingStatus.cancelled_by_salon
    if reason:
        b.cancellation_reason = reason
    await db.flush()
    await db.commit()
    await db.refresh(b)
    await state.clear()

    svc = await db.get(Service, b.service_id)
    client = await db.get(Client, b.client_id)
    summary = _booking_summary(b, svc, client)
    await message.answer(f"\u274c <b>Запись отменена.</b>\n\n{summary}", parse_mode="HTML")

    if message.bot:
        await notify_client_booking_rejected(b.id, message.bot, db, reason=reason)


# ── Перенос: шаг 1 — связаться с клиентом ───────────────────────────────────

@router.callback_query(F.data.startswith("bk:reschedule:"))
async def reschedule_start(callback: CallbackQuery, state: FSMContext, db: AsyncSession) -> None:
    await callback.answer()
    booking_id = UUID(callback.data.split(":", 2)[2])
    b = await _get_booking(db, booking_id)
    if b is None:
        await callback.message.answer("\u26a0\ufe0f Запись не найдена.")
        return

    client = await db.get(Client, b.client_id)
    cname = "клиентом"
    if client:
        cname = " ".join(x for x in (client.first_name or "", client.last_name or "") if x).strip() or "клиентом"

    tg_url: str | None = None
    if client:
        if client.tg_username:
            tg_url = f"https://t.me/{client.tg_username}"
        elif client.tg_user_id:
            tg_url = f"tg://user?id={client.tg_user_id}"

    await state.update_data(booking_id=str(booking_id))
    await state.set_state(RescheduleStates.waiting_admin_confirm)

    buttons: list[list[InlineKeyboardButton]] = []
    if tg_url:
        buttons.append([InlineKeyboardButton(text=f"\U0001f4ac Написать {cname}", url=tg_url)])
    buttons.append([
        InlineKeyboardButton(text="\u2705 Перенос согласован", callback_data="rs:agreed")
    ])

    await callback.message.edit_text(
        "\U0001f550 <b>Перенос записи</b>\n\nСвяжитесь с клиентом и согласуйте новое время.\n"
        "После согласования нажмите «Перенос согласован».",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons),
        parse_mode="HTML",
    )


# ── Перенос: шаг 2 — уточнить, обновили ли в панели ────────────────────────

@router.callback_query(F.data == "rs:agreed", RescheduleStates.waiting_admin_confirm)
async def reschedule_ask_admin(callback: CallbackQuery) -> None:
    await callback.answer()
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="\u2705 Да, уже обновил в панели", callback_data="rs:admin_yes")],
        [InlineKeyboardButton(text="\u274c Нет, выбрать через бот", callback_data="rs:admin_no")],
    ])
    await callback.message.edit_text(
        "Вы уже указали новую дату и время в <b>админ-панели</b>?",
        reply_markup=keyboard,
        parse_mode="HTML",
    )


# ── Ветка А: уже обновил в панели ───────────────────────────────────────────

@router.callback_query(F.data == "rs:admin_yes", RescheduleStates.waiting_admin_confirm)
async def reschedule_admin_confirmed(callback: CallbackQuery, state: FSMContext, db: AsyncSession) -> None:
    await callback.answer()
    data = await state.get_data()
    booking_id = UUID(str(data["booking_id"]))
    await state.clear()
    await callback.message.edit_text(
        "\u2705 <b>Отлично!</b>\n\nЗапись обновлена в календаре. Клиент получит уведомление.",
        reply_markup=None,
        parse_mode="HTML",
    )
    if callback.bot:
        await notify_client_booking_rescheduled(booking_id, callback.bot, db)


# ── Ветка Б: выбрать дату через бот ─────────────────────────────────────────

@router.callback_query(F.data == "rs:admin_no", RescheduleStates.waiting_admin_confirm)
async def reschedule_pick_date(callback: CallbackQuery, state: FSMContext) -> None:
    await callback.answer()
    await state.set_state(RescheduleStates.picking_date)

    today = date.today()
    buttons: list[list[InlineKeyboardButton]] = []
    row: list[InlineKeyboardButton] = []
    for i in range(1, 15):
        d = today + timedelta(days=i)
        label = f"{_DAY_NAMES[d.weekday()]} {d.day} {_MONTH_NAMES[d.month - 1]}"
        row.append(InlineKeyboardButton(text=label, callback_data=f"rs:date:{d.isoformat()}"))
        if len(row) == 3:
            buttons.append(row)
            row = []
    if row:
        buttons.append(row)
    buttons.append([InlineKeyboardButton(text="\u274c Отменить перенос", callback_data="rs:cancel")])

    await callback.message.edit_text(
        "\U0001f4c5 <b>Выберите новую дату записи:</b>",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons),
        parse_mode="HTML",
    )


@router.callback_query(F.data == "rs:admin_no")
async def reschedule_pick_date_any(callback: CallbackQuery, state: FSMContext) -> None:
    """Также обрабатываем «Другая дата» из выбора времени."""
    await callback.answer()
    await state.set_state(RescheduleStates.waiting_admin_confirm)
    # Redirect to pick_date logic
    await reschedule_pick_date.__wrapped__(callback, state)  # type: ignore[attr-defined]


# ── Выбор даты → показать слоты ─────────────────────────────────────────────

@router.callback_query(F.data.startswith("rs:date:"), RescheduleStates.picking_date)
async def reschedule_pick_time(callback: CallbackQuery, state: FSMContext, db: AsyncSession) -> None:
    await callback.answer()
    selected_date_str = callback.data.split("rs:date:")[1]
    selected_date = date.fromisoformat(selected_date_str)
    await state.update_data(new_date=selected_date_str)
    await state.set_state(RescheduleStates.picking_time)

    data = await state.get_data()
    booking_id = UUID(str(data["booking_id"]))
    b = await db.get(Booking, booking_id)
    if b is None:
        await callback.message.answer("\u26a0\ufe0f Запись не найдена.")
        await state.clear()
        return

    # Get service duration
    svc = await db.get(Service, b.service_id)
    duration = int(svc.duration_minutes) if svc else 60

    slots = await get_available_slots(db, b.master_id, selected_date, duration, apply_lead_time=False)
    pretty_date = f"{selected_date.day} {_MONTH_NAMES[selected_date.month - 1]}"

    if not slots:
        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="\u2190 Другая дата", callback_data="rs:back_to_dates")],
            [InlineKeyboardButton(text="\u274c Отменить перенос", callback_data="rs:cancel")],
        ])
        await callback.message.edit_text(
            f"\U0001f614 На {pretty_date} нет свободных слотов. Выберите другую дату.",
            reply_markup=keyboard,
        )
        return

    buttons: list[list[InlineKeyboardButton]] = []
    row: list[InlineKeyboardButton] = []
    for t in slots:
        time_str = t.strftime("%H:%M")
        row.append(InlineKeyboardButton(text=time_str, callback_data=f"rs:time:{time_str}"))
        if len(row) == 4:
            buttons.append(row)
            row = []
    if row:
        buttons.append(row)
    buttons.append([
        InlineKeyboardButton(text="\u2190 Другая дата", callback_data="rs:back_to_dates"),
        InlineKeyboardButton(text="\u274c Отмена", callback_data="rs:cancel"),
    ])

    await callback.message.edit_text(
        f"\U0001f550 <b>Выберите новое время</b>\n\U0001f4c5 {pretty_date}",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons),
        parse_mode="HTML",
    )


@router.callback_query(F.data == "rs:back_to_dates")
async def reschedule_back_to_dates(callback: CallbackQuery, state: FSMContext) -> None:
    await callback.answer()
    await state.set_state(RescheduleStates.waiting_admin_confirm)
    # Reuse date picker
    class _FakeState:
        async def set_state(self, s): pass
        async def get_data(self): return await state.get_data()
        async def update_data(self, **kw): pass
    await state.set_state(RescheduleStates.picking_date)
    today = date.today()
    buttons: list[list[InlineKeyboardButton]] = []
    row: list[InlineKeyboardButton] = []
    for i in range(1, 15):
        d = today + timedelta(days=i)
        label = f"{_DAY_NAMES[d.weekday()]} {d.day} {_MONTH_NAMES[d.month - 1]}"
        row.append(InlineKeyboardButton(text=label, callback_data=f"rs:date:{d.isoformat()}"))
        if len(row) == 3:
            buttons.append(row)
            row = []
    if row:
        buttons.append(row)
    buttons.append([InlineKeyboardButton(text="\u274c Отменить перенос", callback_data="rs:cancel")])
    await callback.message.edit_text(
        "\U0001f4c5 <b>Выберите новую дату записи:</b>",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons),
        parse_mode="HTML",
    )


# ── Выбор времени → применить перенос ───────────────────────────────────────

@router.callback_query(F.data.startswith("rs:time:"), RescheduleStates.picking_time)
async def reschedule_confirm_new_time(
    callback: CallbackQuery, state: FSMContext, db: AsyncSession
) -> None:
    await callback.answer()
    selected_time_str = callback.data.split("rs:time:")[1]
    fsm_data = await state.get_data()
    booking_id = UUID(str(fsm_data["booking_id"]))
    new_date_str = str(fsm_data.get("new_date", ""))

    from datetime import datetime
    from zoneinfo import ZoneInfo
    from app.utils.datetime_utils import ensure_aware

    ctx = await get_schedule_context(db)
    tz = ZoneInfo(ctx.timezone)
    naive_dt = datetime.strptime(f"{new_date_str} {selected_time_str}", "%Y-%m-%d %H:%M")
    new_start_local = naive_dt.replace(tzinfo=tz)
    new_start_utc = ensure_aware(new_start_local)

    b = await db.get(Booking, booking_id)
    if b is None:
        await callback.message.answer("\u26a0\ufe0f Запись не найдена.")
        await state.clear()
        return

    svc = await db.get(Service, b.service_id)
    duration = int(svc.duration_minutes) if svc else 60

    from datetime import timedelta
    b.starts_at = new_start_utc
    b.ends_at = new_start_utc + timedelta(minutes=duration)
    b.status = BookingStatus.confirmed
    await db.flush()
    await db.commit()
    await db.refresh(b)
    await state.clear()

    local_dt = new_start_local
    pretty_date = f"{local_dt.day} {_MONTH_NAMES[local_dt.month - 1]}"
    await callback.message.edit_text(
        f"\u2705 <b>Перенос подтверждён!</b>\n\n"
        f"Запись перенесена:\n"
        f"\U0001f4c5 {pretty_date}\n"
        f"\U0001f550 {selected_time_str}\n\n"
        f"Клиент получит уведомление.",
        reply_markup=None,
        parse_mode="HTML",
    )
    if callback.bot:
        await notify_client_booking_rescheduled(b.id, callback.bot, db)


# ── Отмена переноса ──────────────────────────────────────────────────────────

@router.callback_query(F.data == "rs:cancel")
async def reschedule_cancel(callback: CallbackQuery, state: FSMContext) -> None:
    await callback.answer()
    await state.clear()
    await callback.message.edit_text(
        "Перенос отменён. Запись осталась на прежнее время.", reply_markup=None
    )


# ── Legacy callback (старый формат bk:reschedule_confirm:) ───────────────────

@router.callback_query(F.data.startswith("bk:reschedule_confirm:"))
async def reschedule_confirm_legacy(callback: CallbackQuery, state: FSMContext, db: AsyncSession) -> None:
    """Обратная совместимость со старыми inline-кнопками."""
    await callback.answer()
    booking_id = UUID(callback.data.split(":", 2)[2])
    b = await _get_booking(db, booking_id)
    if b is None:
        await callback.message.answer("\u26a0\ufe0f Запись не найдена.")
        return
    b.status = BookingStatus.confirmed
    await db.flush()
    await db.commit()
    await db.refresh(b)
    await state.clear()
    await callback.message.edit_text(
        "\u2705 <b>Перенос подтверждён! Запись обновлена в календаре.</b>",
        reply_markup=None,
        parse_mode="HTML",
    )
    if callback.bot:
        await notify_client_booking_confirmed(b.id, callback.bot, db)
