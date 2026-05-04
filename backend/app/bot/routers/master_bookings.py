"""Обработчики кнопок подтверждения/отклонения/переноса записи для мастеров."""

from __future__ import annotations

import logging
from uuid import UUID

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.bot.states import MasterBookingStates
from app.models.booking import Booking
from app.models.catalog import Service
from app.models.client import Client
from app.models.enums import BookingStatus
from app.models.master import Master
from app.services.notifications import notify_client_booking_confirmed, notify_client_booking_rejected
from app.utils.datetime_utils import format_booking_datetime

logger = logging.getLogger(__name__)
router = Router(name="master_bookings")


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
        await callback.message.edit_text(
            f"\u2139\ufe0f Запись {label}.",
            reply_markup=None,
        )
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
    await callback.message.answer(
        "Укажите причину отказа или отправьте /skip чтобы пропустить:"
    )


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


@router.callback_query(F.data.startswith("bk:reschedule:"))
async def reschedule_booking_callback(callback: CallbackQuery, state: FSMContext, db: AsyncSession) -> None:
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

    buttons: list[list[InlineKeyboardButton]] = []
    if tg_url:
        buttons.append(
            [InlineKeyboardButton(text=f"\U0001f4ac Написать {cname}", url=tg_url)]
        )
    buttons.append(
        [
            InlineKeyboardButton(
                text="\u2705 Перенос согласован",
                callback_data=f"bk:reschedule_confirm:{booking_id}",
            )
        ]
    )

    await state.update_data(booking_id=str(booking_id))
    await state.set_state(MasterBookingStates.reschedule_pending)

    await callback.message.edit_text(
        "\U0001f550 Для переноса свяжитесь с клиентом и согласуйте новое время.\n"
        "После согласования нажмите «Перенос согласован».",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons),
    )


@router.callback_query(F.data.startswith("bk:reschedule_confirm:"))
async def reschedule_confirm_callback(callback: CallbackQuery, state: FSMContext, db: AsyncSession) -> None:
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
