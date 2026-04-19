"""Показ календаря выбора даты."""

from __future__ import annotations

import calendar as cal_mod
from datetime import date
from uuid import UUID

import app.core.clock as clock
from aiogram.fsm.context import FSMContext
from aiogram.types import InlineKeyboardMarkup, Message
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from zoneinfo import ZoneInfo

from app.bot.fluent_i18n import format_message
from app.bot.keyboards.calendar import month_calendar_keyboard
from app.bot.states import BookingStates
from app.models.catalog import MasterService, Service
from app.services import schedule_service
from app.services.schedule_service import get_schedule_context


async def _duration_for_pair(db: AsyncSession, master_id: UUID, service_id: UUID) -> int:
    svc = await db.get(Service, service_id)
    if svc is None:
        return 60
    ms = (
        await db.execute(
            select(MasterService).where(
                MasterService.master_id == master_id,
                MasterService.service_id == service_id,
            )
        )
    ).scalar_one_or_none()
    if ms and ms.duration_override is not None:
        return int(ms.duration_override)
    return int(svc.duration_minutes)


async def salon_today(db: AsyncSession) -> date:
    ctx = await get_schedule_context(db)
    z = ZoneInfo(ctx.timezone)
    return clock.utc_now().astimezone(z).date()


async def _calendar_payload(
    db: AsyncSession,
    state: FSMContext,
    locale: str,
) -> tuple[str, InlineKeyboardMarkup]:
    data = await state.get_data()
    master_id = UUID(str(data["master_id"]))
    service_id = UUID(str(data["service_id"]))
    dur = await _duration_for_pair(db, master_id, service_id)

    today = await salon_today(db)
    y = int(data.get("cal_year") or today.year)
    m = int(data.get("cal_month") or today.month)

    days_with_slots: set[int] = set()
    _, last = cal_mod.monthrange(y, m)
    for d in range(1, last + 1):
        day = date(y, m, d)
        if day < today:
            continue
        slots = await schedule_service.get_available_slots(
            db, master_id, day, dur, apply_lead_time=True
        )
        if slots:
            days_with_slots.add(d)

    kb = month_calendar_keyboard(locale, today, y, m, days_with_slots)
    text = format_message(locale, "booking-choose-date")
    return text, kb


async def show_date_calendar(
    message: Message,
    db: AsyncSession,
    state: FSMContext,
    locale: str,
) -> None:
    await state.set_state(BookingStates.pick_date)
    text, kb = await _calendar_payload(db, state, locale)
    await message.answer(text, reply_markup=kb)


async def edit_date_calendar(
    message: Message,
    db: AsyncSession,
    state: FSMContext,
    locale: str,
) -> None:
    await state.set_state(BookingStates.pick_date)
    text, kb = await _calendar_payload(db, state, locale)
    await message.edit_text(text, reply_markup=kb)
