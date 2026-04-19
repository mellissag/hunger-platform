"""Сценарий записи (§4)."""

from __future__ import annotations

from datetime import UTC, datetime, time
from decimal import Decimal
from uuid import UUID

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, KeyboardButton, Message, ReplyKeyboardMarkup, ReplyKeyboardRemove
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from zoneinfo import ZoneInfo

from app.bot.calendar_ui import edit_date_calendar, show_date_calendar
from app.bot.fluent_i18n import format_message
from app.bot.keyboards.booking import (
    categories_keyboard,
    confirm_booking_keyboard,
    flow_type_keyboard,
    masters_list_keyboard,
    prepayment_keyboard,
    services_list_keyboard,
    success_keyboard,
    time_slots_keyboard,
)
from app.bot.keyboards.main_menu import main_menu_keyboard
from app.bot.salon_context import get_ai_enabled
from app.bot.states import BookingStates
from app.bot.utils import normalize_phone, pick_i18n
from app.core.exceptions import ClientBlacklistedError, SlotTakenError
from app.models.catalog import MasterService, Service, ServiceCategory
from app.models.client import Client
from app.models.master import Master
from app.models.salon import Salon, Settings
from app.services import schedule_service
from app.services.bot_booking import create_tg_booking, is_blacklisted, reschedule_tg_booking
from app.services.schedule_service import get_schedule_context

router = Router(name="booking")


async def _salon_phone(db: AsyncSession) -> str:
    s = (await db.execute(select(Salon).limit(1))).scalar_one_or_none()
    if s is None:
        return "+000"
    d = s.description or {}
    return str(d.get("phone") or d.get("contact_phone") or "+000")


@router.callback_query(F.data == "menu:book")
async def cb_book_entry(
    query: CallbackQuery,
    db: AsyncSession,
    tg_client: Client,
    locale: str,
    state: FSMContext,
) -> None:
    await query.answer()
    if await is_blacklisted(db, tg_client.id):
        await query.message.answer(
            format_message(locale, "blacklist-blocked", {"phone": await _salon_phone(db)}),
        )
        return
    await state.set_state(BookingStates.start)
    await state.update_data(m_page=0, t_page=0, cal_year=None, cal_month=None)
    await query.message.edit_text(
        format_message(locale, "booking-choose-flow"),
        reply_markup=flow_type_keyboard(locale),
    )


@router.callback_query(BookingStates.start, F.data == "book:flow:master")
async def cb_flow_master(
    query: CallbackQuery,
    db: AsyncSession,
    locale: str,
    state: FSMContext,
) -> None:
    await query.answer()
    await state.set_state(BookingStates.pick_master)
    await state.update_data(flow="master_first", m_page=0)
    await render_masters(query, db, locale, state)


async def render_masters(query: CallbackQuery, db: AsyncSession, locale: str, state: FSMContext) -> None:
    data = await state.get_data()
    page = int(data.get("m_page") or 0)
    rows = (
        await db.execute(
            select(Master).where(Master.is_active.is_(True)).order_by(Master.sort_order.asc())
        )
    ).scalars().all()
    items = [(m.id, m.display_name) for m in rows]
    await query.message.edit_text(
        format_message(locale, "booking-choose-master"),
        reply_markup=masters_list_keyboard(locale, items, prefix="book:mm", page=page),
    )


@router.callback_query(BookingStates.pick_master, F.data.startswith("book:mm:mpage:"))
async def cb_master_page(
    query: CallbackQuery,
    db: AsyncSession,
    locale: str,
    state: FSMContext,
) -> None:
    await query.answer()
    page = int(query.data.split(":")[-1])
    await state.update_data(m_page=page)
    await render_masters(query, db, locale, state)


@router.callback_query(BookingStates.pick_master, F.data.startswith("book:mm:m:"))
async def cb_master_picked(
    query: CallbackQuery,
    db: AsyncSession,
    locale: str,
    state: FSMContext,
) -> None:
    await query.answer()
    mid = UUID(query.data.split(":")[-1])
    await state.update_data(master_id=str(mid))
    await state.set_state(BookingStates.pick_service_for_master)
    await render_services_for_master(query, db, locale, state)


async def render_services_for_master(
    query: CallbackQuery, db: AsyncSession, locale: str, state: FSMContext
) -> None:
    data = await state.get_data()
    mid = UUID(str(data["master_id"]))
    q = (
        select(Service)
        .join(MasterService, MasterService.service_id == Service.id)
        .where(MasterService.master_id == mid, Service.is_active.is_(True))
        .order_by(Service.sort_order.asc())
    )
    svcs = (await db.execute(q)).scalars().all()
    items = [(s.id, pick_i18n(s.name_i18n, locale)) for s in svcs]
    await query.message.edit_text(
        format_message(locale, "booking-choose-service"),
        reply_markup=services_list_keyboard(locale, items, prefix="book:ms", back_cb="menu:main"),
    )


@router.callback_query(
    BookingStates.pick_service_for_master,
    F.data.startswith("book:ms:s:"),
)
async def cb_service_picked_mf(
    query: CallbackQuery,
    db: AsyncSession,
    locale: str,
    state: FSMContext,
) -> None:
    await query.answer()
    sid = UUID(query.data.split(":")[-1])
    await state.update_data(service_id=str(sid))
    await show_date_calendar(query.message, db, state, locale)


@router.callback_query(BookingStates.start, F.data == "book:flow:service")
async def cb_flow_service(
    query: CallbackQuery,
    db: AsyncSession,
    locale: str,
    state: FSMContext,
) -> None:
    await query.answer()
    await state.set_state(BookingStates.pick_service)
    await state.update_data(flow="service_first")
    cats = (await db.execute(select(ServiceCategory).order_by(ServiceCategory.sort_order.asc()))).scalars().all()
    items = [(c.id, pick_i18n(c.name_i18n, locale)) for c in cats]
    await query.message.edit_text(
        format_message(locale, "booking-choose-category"),
        reply_markup=categories_keyboard(locale, items),
    )


@router.callback_query(BookingStates.pick_service, F.data.startswith("book:cat:"))
async def cb_category(
    query: CallbackQuery,
    db: AsyncSession,
    locale: str,
    state: FSMContext,
) -> None:
    await query.answer()
    cid = UUID(query.data.split(":")[-1])
    await state.update_data(category_id=str(cid))
    await state.set_state(BookingStates.pick_master_for_service)
    q = (
        select(Service)
        .where(Service.category_id == cid, Service.is_active.is_(True))
        .order_by(Service.sort_order.asc())
    )
    svcs = (await db.execute(q)).scalars().all()
    items = [(s.id, pick_i18n(s.name_i18n, locale)) for s in svcs]
    await query.message.edit_text(
        format_message(locale, "booking-choose-service"),
        reply_markup=services_list_keyboard(locale, items, prefix="book:fs"),
    )


@router.callback_query(
    BookingStates.pick_master_for_service,
    F.data.startswith("book:fs:s:"),
)
async def cb_service_picked_sf(
    query: CallbackQuery,
    db: AsyncSession,
    locale: str,
    state: FSMContext,
) -> None:
    await query.answer()
    sid = UUID(query.data.split(":")[-1])
    await state.update_data(service_id=str(sid))
    await state.set_state(BookingStates.pick_master)
    q = (
        select(Master)
        .join(MasterService, MasterService.master_id == Master.id)
        .where(MasterService.service_id == sid, Master.is_active.is_(True))
        .order_by(Master.sort_order.asc())
    )
    masters = (await db.execute(q)).scalars().all()
    items = [(m.id, m.display_name) for m in masters]
    await state.update_data(m_page=0)
    await query.message.edit_text(
        format_message(locale, "booking-choose-master"),
        reply_markup=masters_list_keyboard(locale, items, prefix="book:fm", page=0),
    )


@router.callback_query(BookingStates.pick_master, F.data.startswith("book:fm:mpage:"))
async def cb_fm_page(
    query: CallbackQuery,
    db: AsyncSession,
    locale: str,
    state: FSMContext,
) -> None:
    await query.answer()
    page = int(query.data.split(":")[-1])
    await state.update_data(m_page=page)
    data = await state.get_data()
    sid = UUID(str(data["service_id"]))
    q = (
        select(Master)
        .join(MasterService, MasterService.master_id == Master.id)
        .where(MasterService.service_id == sid, Master.is_active.is_(True))
        .order_by(Master.sort_order.asc())
    )
    masters = (await db.execute(q)).scalars().all()
    items = [(m.id, m.display_name) for m in masters]
    await query.message.edit_text(
        format_message(locale, "booking-choose-master"),
        reply_markup=masters_list_keyboard(locale, items, prefix="book:fm", page=page),
    )


@router.callback_query(BookingStates.pick_master, F.data.startswith("book:fm:m:"))
async def cb_master_picked_sf(
    query: CallbackQuery,
    db: AsyncSession,
    locale: str,
    state: FSMContext,
) -> None:
    await query.answer()
    mid = UUID(query.data.split(":")[-1])
    await state.update_data(master_id=str(mid))
    await show_date_calendar(query.message, db, state, locale)


@router.callback_query(BookingStates.pick_date, F.data.startswith("book:cal:noop"))
async def cb_cal_noop(query: CallbackQuery) -> None:
    await query.answer()


@router.callback_query(BookingStates.pick_date, F.data.startswith("book:cal:prev:"))
async def cb_cal_prev(
    query: CallbackQuery,
    db: AsyncSession,
    locale: str,
    state: FSMContext,
) -> None:
    await query.answer()
    parts = query.data.split(":")
    y, m = int(parts[3]), int(parts[4])
    if m == 1:
        y -= 1
        m = 12
    else:
        m -= 1
    await state.update_data(cal_year=y, cal_month=m)
    await edit_date_calendar(query.message, db, state, locale)


@router.callback_query(BookingStates.pick_date, F.data.startswith("book:cal:next:"))
async def cb_cal_next(
    query: CallbackQuery,
    db: AsyncSession,
    locale: str,
    state: FSMContext,
) -> None:
    await query.answer()
    parts = query.data.split(":")
    y, m = int(parts[3]), int(parts[4])
    if m == 12:
        y += 1
        m = 1
    else:
        m += 1
    await state.update_data(cal_year=y, cal_month=m)
    await edit_date_calendar(query.message, db, state, locale)


@router.callback_query(BookingStates.pick_date, F.data.startswith("book:cal:pick:"))
async def cb_cal_pick(
    query: CallbackQuery,
    db: AsyncSession,
    locale: str,
    state: FSMContext,
) -> None:
    await query.answer()
    day_s = query.data.split(":")[-1]
    await state.update_data(picked_date=day_s)
    await state.set_state(BookingStates.pick_time)
    await render_time_slots(query, db, locale, state)


async def render_time_slots(
    query: CallbackQuery, db: AsyncSession, locale: str, state: FSMContext
) -> None:
    data = await state.get_data()
    master_id = UUID(str(data["master_id"]))
    service_id = UUID(str(data["service_id"]))
    day = datetime.strptime(str(data["picked_date"]), "%Y-%m-%d").date()
    svc = await db.get(Service, service_id)
    ms = (
        await db.execute(
            select(MasterService).where(
                MasterService.master_id == master_id,
                MasterService.service_id == service_id,
            )
        )
    ).scalar_one_or_none()
    dur = int(ms.duration_override) if ms and ms.duration_override else int(svc.duration_minutes)  # type: ignore[union-attr]
    slots = await schedule_service.get_available_slots(db, master_id, day, dur, apply_lead_time=True)
    times = [t.strftime("%H:%M") for t in slots]
    page = int(data.get("t_page") or 0)
    if not times:
        await query.message.edit_text(
            format_message(locale, "booking-no-slots"),
            reply_markup=None,
        )
        return
    await query.message.edit_text(
        format_message(locale, "booking-choose-time"),
        reply_markup=time_slots_keyboard(locale, times, page=page),
    )


@router.callback_query(BookingStates.pick_time, F.data.startswith("book:tpage:"))
async def cb_time_page(
    query: CallbackQuery,
    db: AsyncSession,
    locale: str,
    state: FSMContext,
) -> None:
    await query.answer()
    page = int(query.data.split(":")[-1])
    await state.update_data(t_page=page)
    await render_time_slots_refresh(query, db, locale, state)


async def render_time_slots_refresh(
    query: CallbackQuery, db: AsyncSession, locale: str, state: FSMContext
) -> None:
    data = await state.get_data()
    master_id = UUID(str(data["master_id"]))
    service_id = UUID(str(data["service_id"]))
    day = datetime.strptime(str(data["picked_date"]), "%Y-%m-%d").date()
    svc = await db.get(Service, service_id)
    ms = (
        await db.execute(
            select(MasterService).where(
                MasterService.master_id == master_id,
                MasterService.service_id == service_id,
            )
        )
    ).scalar_one_or_none()
    dur = int(ms.duration_override) if ms and ms.duration_override else int(svc.duration_minutes)  # type: ignore[union-attr]
    slots = await schedule_service.get_available_slots(db, master_id, day, dur, apply_lead_time=True)
    times = [t.strftime("%H:%M") for t in slots]
    page = int(data.get("t_page") or 0)
    await query.message.edit_text(
        format_message(locale, "booking-choose-time"),
        reply_markup=time_slots_keyboard(locale, times, page=page),
    )


@router.callback_query(BookingStates.pick_time, F.data.startswith("book:time:"))
async def cb_time_picked(
    query: CallbackQuery,
    db: AsyncSession,
    tg_client: Client,
    locale: str,
    state: FSMContext,
) -> None:
    await query.answer()
    hm = query.data.split(":")[-1]
    await state.update_data(picked_time=hm, t_page=0)
    if tg_client.first_name and tg_client.phone:
        await state.set_state(BookingStates.confirm)
        await show_confirm(query, db, tg_client, locale, state)
    else:
        await state.set_state(BookingStates.enter_name)
        await query.message.edit_text(format_message(locale, "booking-enter-name"))


@router.message(BookingStates.enter_name, F.text)
async def msg_name(
    message: Message,
    locale: str,
    state: FSMContext,
) -> None:
    await state.update_data(temp_name=message.text.strip()[:120])
    await state.set_state(BookingStates.enter_phone)
    kb = ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text=format_message(locale, "booking-share-contact"), request_contact=True)]
        ],
        resize_keyboard=True,
        one_time_keyboard=True,
    )
    await message.answer(format_message(locale, "booking-enter-phone"), reply_markup=kb)


@router.message(BookingStates.enter_phone, F.contact)
async def msg_phone_contact(
    message: Message,
    locale: str,
    state: FSMContext,
    db: AsyncSession,
    tg_client: Client,
) -> None:
    if message.contact and message.contact.phone_number:
        raw = message.contact.phone_number
        phone = normalize_phone(raw if raw.startswith("+") else f"+{raw}")
        if phone:
            tg_client.phone = phone
            await db.flush()
    await state.set_state(BookingStates.confirm)
    await message.answer(
        format_message(locale, "booking-phone-saved"),
        reply_markup=ReplyKeyboardRemove(),
    )
    await show_confirm_msg(message, db, tg_client, locale, state)


@router.message(BookingStates.enter_phone, F.text)
async def msg_phone_text(
    message: Message,
    locale: str,
    state: FSMContext,
    db: AsyncSession,
    tg_client: Client,
) -> None:
    phone = normalize_phone(message.text)
    if not phone:
        await message.answer(format_message(locale, "error-phone"))
        return
    tg_client.phone = phone
    await db.flush()
    await state.set_state(BookingStates.confirm)
    await message.answer(format_message(locale, "booking-phone-saved"), reply_markup=ReplyKeyboardRemove())
    await show_confirm_msg(message, db, tg_client, locale, state)


async def show_confirm(
    query: CallbackQuery,
    db: AsyncSession,
    tg_client: Client,
    locale: str,
    state: FSMContext,
) -> None:
    data = await state.get_data()
    text = await _confirm_text(db, locale, tg_client, data)
    await query.message.edit_text(text, reply_markup=confirm_booking_keyboard(locale))


async def show_confirm_msg(
    message: Message,
    db: AsyncSession,
    tg_client: Client,
    locale: str,
    state: FSMContext,
) -> None:
    data = await state.get_data()
    text = await _confirm_text(db, locale, tg_client, data)
    await message.answer(text, reply_markup=confirm_booking_keyboard(locale))


async def _confirm_text(
    db: AsyncSession,
    locale: str,
    tg_client: Client,
    data: dict,
) -> str:
    master_id = UUID(str(data["master_id"]))
    service_id = UUID(str(data["service_id"]))
    m = await db.get(Master, master_id)
    svc = await db.get(Service, service_id)
    ms = (
        await db.execute(
            select(MasterService).where(
                MasterService.master_id == master_id,
                MasterService.service_id == service_id,
            )
        )
    ).scalar_one_or_none()
    price = ms.price_override if ms and ms.price_override is not None else svc.price  # type: ignore[union-attr]
    dur = int(ms.duration_override) if ms and ms.duration_override else int(svc.duration_minutes)  # type: ignore[union-attr]
    name = (data.get("temp_name") or tg_client.first_name or "").strip()
    phone = tg_client.phone or "—"
    day_s = str(data["picked_date"])
    hm = str(data["picked_time"])
    return format_message(
        locale,
        "booking-confirm-body",
        {
            "service": pick_i18n(svc.name_i18n if svc else {}, locale),  # type: ignore[union-attr]
            "master": m.display_name if m else "—",
            "date": day_s,
            "time": hm,
            "price": str(price),
            "duration": str(dur),
            "name": name,
            "phone": phone,
        },
    )


@router.callback_query(BookingStates.confirm, F.data == "book:confirm:edit")
async def cb_confirm_edit(
    query: CallbackQuery,
    locale: str,
    state: FSMContext,
) -> None:
    await query.answer()
    await state.set_state(BookingStates.enter_name)
    await query.message.edit_text(format_message(locale, "booking-enter-name"))


@router.callback_query(BookingStates.confirm, F.data == "book:confirm:yes")
async def cb_confirm_yes(
    query: CallbackQuery,
    db: AsyncSession,
    tg_client: Client,
    locale: str,
    state: FSMContext,
) -> None:
    await query.answer()
    data = await state.get_data()
    if data.get("temp_name"):
        tg_client.first_name = str(data["temp_name"])[:120]
        await db.flush()

    ctx = await get_schedule_context(db)
    z = ZoneInfo(ctx.timezone)
    day = datetime.strptime(str(data["picked_date"]), "%Y-%m-%d").date()
    hh, mm = str(data["picked_time"]).split(":")
    starts_local = datetime.combine(day, time(int(hh), int(mm)), tzinfo=z)
    starts_at = starts_local.astimezone(UTC)

    settings = (await db.execute(select(Settings).limit(1))).scalar_one_or_none()
    prepay = bool(settings and settings.prepayment_enabled)
    mode = str(data.get("mode") or "create")

    if prepay and mode == "create" and not data.get("reschedule_booking_id"):
        pct = settings.prepayment_percent if settings else 20  # type: ignore[union-attr]
        master_id = UUID(str(data["master_id"]))
        service_id = UUID(str(data["service_id"]))
        svc = await db.get(Service, service_id)
        ms = (
            await db.execute(
                select(MasterService).where(
                    MasterService.master_id == master_id,
                    MasterService.service_id == service_id,
                )
            )
        ).scalar_one_or_none()
        price = ms.price_override if ms and ms.price_override is not None else svc.price  # type: ignore[union-attr]
        amt = (Decimal(str(price)) * Decimal(pct) / Decimal(100)).quantize(Decimal("0.01"))  # type: ignore[name-defined]
        await state.set_state(BookingStates.prepayment)
        salon = (await db.execute(select(Salon).limit(1))).scalar_one_or_none()
        cur = salon.currency if salon else "EUR"
        await query.message.edit_text(
            format_message(locale, "booking-prepayment-required", {"amount": str(amt), "currency": cur}),
            reply_markup=prepayment_keyboard(locale, str(amt), cur),
        )
        return

    await _finalize_booking(query, db, tg_client, locale, state, starts_at)


@router.callback_query(BookingStates.prepayment, F.data == "book:pay:onsite")
async def cb_pay_onsite(
    query: CallbackQuery,
    db: AsyncSession,
    tg_client: Client,
    locale: str,
    state: FSMContext,
) -> None:
    await query.answer()
    data = await state.get_data()
    ctx = await get_schedule_context(db)
    z = ZoneInfo(ctx.timezone)
    day = datetime.strptime(str(data["picked_date"]), "%Y-%m-%d").date()
    hh, mm = str(data["picked_time"]).split(":")
    starts_local = datetime.combine(day, time(int(hh), int(mm)), tzinfo=z)
    starts_at = starts_local.astimezone(UTC)
    await _finalize_booking(query, db, tg_client, locale, state, starts_at)


@router.callback_query(BookingStates.prepayment, F.data == "book:pay:stub")
async def cb_pay_stub(query: CallbackQuery, locale: str) -> None:
    await query.answer(format_message(locale, "payment-not-configured"), show_alert=True)


async def _finalize_booking(
    query: CallbackQuery,
    db: AsyncSession,
    tg_client: Client,
    locale: str,
    state: FSMContext,
    starts_at: datetime,
) -> None:
    data = await state.get_data()
    master_id = UUID(str(data["master_id"]))
    service_id = UUID(str(data["service_id"]))
    mode = str(data.get("mode") or "create")

    try:
        if mode == "reschedule" and data.get("reschedule_booking_id"):
            bid = UUID(str(data["reschedule_booking_id"]))
            b = await reschedule_tg_booking(
                db, client_id=tg_client.id, booking_id=bid, new_starts_at=starts_at
            )
        else:
            b = await create_tg_booking(
                db,
                client_id=tg_client.id,
                master_id=master_id,
                service_id=service_id,
                starts_at=starts_at,
            )
    except SlotTakenError:
        await query.message.edit_text(format_message(locale, "error-slot-taken"))
        await state.clear()
        return
    except ClientBlacklistedError:
        await query.message.edit_text(
            format_message(locale, "blacklist-blocked", {"phone": await _salon_phone(db)}),
        )
        await state.clear()
        return

    m = await db.get(Master, b.master_id)
    await state.clear()
    await query.message.edit_text(
        format_message(
            locale,
            "booking-success",
            {
                "date": b.starts_at.astimezone(UTC).strftime("%Y-%m-%d"),
                "time": b.starts_at.astimezone(UTC).strftime("%H:%M"),
                "master": m.display_name if m else "",
            },
        ),
        reply_markup=success_keyboard(locale),
    )


@router.callback_query(BookingStates.confirm, F.data == "book:confirm:cancel")
async def cb_confirm_cancel(
    query: CallbackQuery,
    db: AsyncSession,
    locale: str,
    state: FSMContext,
) -> None:
    await query.answer()
    await state.clear()
    ai = await get_ai_enabled(db)
    await query.message.edit_text(
        format_message(locale, "booking-aborted"),
        reply_markup=main_menu_keyboard(locale, ai_enabled=ai),
    )
