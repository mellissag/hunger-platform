"""Слоты и календарь: timezone салона, рабочие часы, блоки, буфер, lead time."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import app.core.clock as clock
from app.core.exceptions import InvalidScheduleError
from app.models.booking import Booking
from app.models.enums import BookingCreatedVia, BookingStatus, SlotType
from app.models.master import Master
from app.models.salon import Salon, Settings
from app.models.schedule import ScheduleSlot

# Шаг сетки слотов (минуты). Должен делить типичные длительности; совпадает с гранулярностью буфера.
SLOT_STEP_MINUTES = 5

_ACTIVE_BOOKING = (BookingStatus.pending, BookingStatus.confirmed)

_WEEKDAY_KEYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


@dataclass(frozen=True)
class SalonScheduleContext:
    timezone: str
    buffer_minutes: int
    lead_time_minutes: int
    working_hours_default: dict[str, Any]


async def get_schedule_context(db: AsyncSession) -> SalonScheduleContext:
    row = (
        await db.execute(
            select(Salon, Settings)
            .join(Settings, Settings.salon_id == Salon.id)
            .limit(1)
        )
    ).first()
    if row is None:
        return SalonScheduleContext(
            timezone="Europe/Sofia",
            buffer_minutes=5,
            lead_time_minutes=60,
            working_hours_default={},
        )
    salon, settings = row
    return SalonScheduleContext(
        timezone=salon.timezone,
        buffer_minutes=settings.booking_buffer_minutes,
        lead_time_minutes=settings.booking_lead_time_minutes,
        working_hours_default=dict(settings.working_hours_default or {}),
    )


def _parse_hhmm(s: str) -> time:
    parts = s.strip().split(":")
    h = int(parts[0])
    m = int(parts[1]) if len(parts) > 1 else 0
    return time(h, m)


def _default_local_window(
    day: date, tz_name: str, working_hours_default: dict[str, Any]
) -> tuple[datetime, datetime]:
    """Окно по умолчанию на локальный день: либо из JSON, либо весь день."""
    z = ZoneInfo(tz_name)
    day_start = datetime.combine(day, time.min, tzinfo=z)
    day_end = day_start + timedelta(days=1)
    wk = _WEEKDAY_KEYS[day.weekday()]
    seg = working_hours_default.get(wk)
    if not seg:
        return day_start, day_end
    open_t = _parse_hhmm(str(seg["open"]))
    close_t = _parse_hhmm(str(seg["close"]))
    win_start = datetime.combine(day, open_t, tzinfo=z)
    win_end = datetime.combine(day, close_t, tzinfo=z)
    if win_end <= win_start:
        win_end += timedelta(days=1)
    return win_start, min(win_end, day_end)


def _merge_ranges(ranges: list[tuple[datetime, datetime]]) -> list[tuple[datetime, datetime]]:
    if not ranges:
        return []
    s = sorted(ranges, key=lambda x: x[0])
    out: list[tuple[datetime, datetime]] = [s[0]]
    for a, b in s[1:]:
        la, lb = out[-1]
        if a <= lb:
            out[-1] = (la, max(lb, b))
        else:
            out.append((a, b))
    return out


def _subtract_range(
    ranges: list[tuple[datetime, datetime]], sub: tuple[datetime, datetime]
) -> list[tuple[datetime, datetime]]:
    sa, sb = sub
    out: list[tuple[datetime, datetime]] = []
    for ra, rb in ranges:
        if sb <= ra or sa >= rb:
            out.append((ra, rb))
            continue
        if sa > ra:
            out.append((ra, min(sa, rb)))
        if sb < rb:
            out.append((max(sb, ra), rb))
    return _merge_ranges(out)


async def _working_ranges_for_day(
    db: AsyncSession,
    master_id: UUID,
    day: date,
    ctx: SalonScheduleContext,
) -> list[tuple[datetime, datetime]]:
    z = ZoneInfo(ctx.timezone)
    day_start = datetime.combine(day, time.min, tzinfo=z).astimezone(UTC)
    day_end = day_start + timedelta(days=1)

    working_rows = (
        await db.execute(
            select(ScheduleSlot).where(
                ScheduleSlot.master_id == master_id,
                ScheduleSlot.slot_type == SlotType.working,
                ScheduleSlot.starts_at < day_end,
                ScheduleSlot.ends_at > day_start,
            )
        )
    ).scalars().all()

    ranges: list[tuple[datetime, datetime]] = []
    for w in working_rows:
        ra = max(w.starts_at, day_start)
        rb = min(w.ends_at, day_end)
        if ra < rb:
            ranges.append((ra, rb))

    if ranges:
        merged = _merge_ranges(ranges)
    else:
        ls, le = _default_local_window(day, ctx.timezone, ctx.working_hours_default)
        merged = _merge_ranges([(ls.astimezone(UTC), le.astimezone(UTC))])

    block_types = (
        SlotType.vacation,
        SlotType.sick,
        SlotType.block,
        SlotType.break_,
    )
    blocks = (
        await db.execute(
            select(ScheduleSlot).where(
                ScheduleSlot.master_id == master_id,
                ScheduleSlot.slot_type.in_(block_types),
                ScheduleSlot.starts_at < day_end,
                ScheduleSlot.ends_at > day_start,
            )
        )
    ).scalars().all()

    for b in blocks:
        ba = max(b.starts_at, day_start)
        bb = min(b.ends_at, day_end)
        if ba < bb:
            merged = _subtract_range(merged, (ba, bb))

    return [x for x in merged if x[0] < x[1]]


async def _bookings_conflicts(
    db: AsyncSession, master_id: UUID, day_start: datetime, day_end: datetime
) -> list[tuple[datetime, datetime, UUID]]:
    rows = (
        await db.execute(
            select(Booking.starts_at, Booking.ends_at, Booking.id).where(
                Booking.master_id == master_id,
                Booking.status.in_(_ACTIVE_BOOKING),
                Booking.starts_at < day_end,
                Booking.ends_at > day_start,
            )
        )
    ).all()
    return [(r[0], r[1], r[2]) for r in rows]


def _conflicts_with_bookings(
    ns: datetime,
    ne: datetime,
    buf: timedelta,
    bookings: list[tuple[datetime, datetime, UUID]],
    *,
    exclude_booking_id: UUID | None,
) -> bool:
    for bs, be, bid in bookings:
        if exclude_booking_id is not None and bid == exclude_booking_id:
            continue
        if ns < be + buf and ne + buf > bs:
            return True
    return False


async def get_available_slots(
    db: AsyncSession,
    master_id: UUID,
    day: date,
    service_duration_minutes: int,
    *,
    apply_lead_time: bool = True,
) -> list[time]:
    """Старты услуги в timezone салона (только clock time для выбранной даты)."""
    ctx = await get_schedule_context(db)
    z = ZoneInfo(ctx.timezone)
    day_start_utc = datetime.combine(day, time.min, tzinfo=z).astimezone(UTC)
    day_end_utc = day_start_utc + timedelta(days=1)

    windows = await _working_ranges_for_day(db, master_id, day, ctx)
    bookings = await _bookings_conflicts(db, master_id, day_start_utc, day_end_utc)
    buf = timedelta(minutes=ctx.buffer_minutes)
    lead = timedelta(minutes=ctx.lead_time_minutes) if apply_lead_time else timedelta(0)
    now = clock.utc_now()
    dur = timedelta(minutes=service_duration_minutes)
    step = timedelta(minutes=SLOT_STEP_MINUTES)

    out: list[time] = []
    for wa, wb in windows:
        t = wa
        while t + dur <= wb + timedelta(seconds=0):
            ne = t + dur
            if apply_lead_time and t < now + lead:
                t += step
                continue
            if _conflicts_with_bookings(t, ne, buf, bookings, exclude_booking_id=None):
                t += step
                continue
            local = t.astimezone(z)
            if local.date() != day:
                t += step
                continue
            out.append(local.time())
            t += step

    # Уникальные времена с сохранением порядка
    seen: set[time] = set()
    uniq: list[time] = []
    for tm in out:
        if tm not in seen:
            seen.add(tm)
            uniq.append(tm)
    return uniq


async def enumerate_slot_candidates(
    db: AsyncSession,
    master_id: UUID,
    day: date,
    service_duration_minutes: int,
    *,
    apply_lead_time: bool = True,
) -> list[tuple[time, bool]]:
    """Все кандидаты старта на локальный день с флагом доступности (для UI выбора слота)."""
    ctx = await get_schedule_context(db)
    z = ZoneInfo(ctx.timezone)
    day_start_utc = datetime.combine(day, time.min, tzinfo=z).astimezone(UTC)
    day_end_utc = day_start_utc + timedelta(days=1)

    windows = await _working_ranges_for_day(db, master_id, day, ctx)
    bookings = await _bookings_conflicts(db, master_id, day_start_utc, day_end_utc)
    buf = timedelta(minutes=ctx.buffer_minutes)
    lead = timedelta(minutes=ctx.lead_time_minutes) if apply_lead_time else timedelta(0)
    now = clock.utc_now()
    dur = timedelta(minutes=service_duration_minutes)
    step = timedelta(minutes=SLOT_STEP_MINUTES)

    out: list[tuple[time, bool]] = []
    for wa, wb in windows:
        t = wa
        while t + dur <= wb + timedelta(seconds=0):
            ne = t + dur
            blocked_by_lead = apply_lead_time and t < now + lead
            conflict = _conflicts_with_bookings(t, ne, buf, bookings, exclude_booking_id=None)
            local = t.astimezone(z)
            if local.date() != day:
                t += step
                continue
            tm = local.time()
            available = not blocked_by_lead and not conflict
            out.append((tm, available))
            t += step

    seen: set[time] = set()
    uniq: list[tuple[time, bool]] = []
    for tm, av in out:
        if tm not in seen:
            seen.add(tm)
            uniq.append((tm, av))
    return uniq


async def validate_booking_window(
    db: AsyncSession,
    *,
    master_id: UUID,
    starts_at: datetime,
    ends_at: datetime,
    created_via: BookingCreatedVia,
    exclude_booking_id: UUID | None = None,
) -> None:
    """Проверка окна брони: рабочее время, блоки, lead time (для бота)."""
    if starts_at.tzinfo is None or ends_at.tzinfo is None:
        raise InvalidScheduleError("starts_at/ends_at must be timezone-aware")
    ctx = await get_schedule_context(db)
    z = ZoneInfo(ctx.timezone)
    local_start = starts_at.astimezone(z)
    day = local_start.date()
    windows = await _working_ranges_for_day(db, master_id, day, ctx)
    inside = any(ws <= starts_at and ends_at <= we for ws, we in windows)
    if not inside:
        raise InvalidScheduleError("Outside working hours or inside a block")

    day_start_utc = datetime.combine(day, time.min, tzinfo=z).astimezone(UTC)
    day_end_utc = day_start_utc + timedelta(days=1)
    bookings = await _bookings_conflicts(db, master_id, day_start_utc, day_end_utc)
    buf = timedelta(minutes=ctx.buffer_minutes)
    if _conflicts_with_bookings(
        starts_at, ends_at, buf, bookings, exclude_booking_id=exclude_booking_id
    ):
        raise InvalidScheduleError("Overlaps an existing booking (including buffer)")

    if created_via == BookingCreatedVia.bot:
        if starts_at < clock.utc_now() + timedelta(minutes=ctx.lead_time_minutes):
            raise InvalidScheduleError("Inside booking lead time")


@dataclass(frozen=True)
class CalendarBookingRow:
    id: UUID
    master_id: UUID
    client_id: UUID
    service_id: UUID
    starts_at: datetime
    ends_at: datetime
    status: BookingStatus
    price: Decimal


@dataclass(frozen=True)
class CalendarSlotRow:
    id: UUID
    master_id: UUID
    slot_type: SlotType
    starts_at: datetime
    ends_at: datetime
    note: str | None


async def get_calendar_bookings(
    db: AsyncSession,
    *,
    master_id: UUID | None,
    utc_from: datetime,
    utc_to: datetime,
) -> list[CalendarBookingRow]:
    stmt = select(Booking).where(
        Booking.starts_at < utc_to,
        Booking.ends_at > utc_from,
    )
    if master_id is not None:
        stmt = stmt.where(Booking.master_id == master_id)
    rows = (await db.execute(stmt)).scalars().all()
    return [
        CalendarBookingRow(
            id=r.id,
            master_id=r.master_id,
            client_id=r.client_id,
            service_id=r.service_id,
            starts_at=r.starts_at,
            ends_at=r.ends_at,
            status=r.status,
            price=r.price,
        )
        for r in rows
    ]


async def get_calendar_slots(
    db: AsyncSession,
    *,
    master_id: UUID | None,
    utc_from: datetime,
    utc_to: datetime,
) -> list[CalendarSlotRow]:
    stmt = select(ScheduleSlot).where(
        ScheduleSlot.starts_at < utc_to,
        ScheduleSlot.ends_at > utc_from,
    )
    if master_id is not None:
        stmt = stmt.where(ScheduleSlot.master_id == master_id)
    rows = (await db.execute(stmt)).scalars().all()
    return [
        CalendarSlotRow(
            id=r.id,
            master_id=r.master_id,
            slot_type=r.slot_type,
            starts_at=r.starts_at,
            ends_at=r.ends_at,
            note=r.note,
        )
        for r in rows
    ]


async def ensure_master_exists(db: AsyncSession, master_id: UUID) -> None:
    m = await db.get(Master, master_id)
    if m is None:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Master not found")
