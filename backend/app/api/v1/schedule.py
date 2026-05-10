"""Слоты и календарь."""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.core.scope import ensure_master_own_master_id
from app.deps import get_db, require_roles
from app.models.booking import Booking
from app.models.catalog import MasterService, Service
from app.models.client import Client
from app.models.enums import BookingStatus, UserRole
from app.models.master import Master
from app.models.salon import Salon
from app.models.schedule import ScheduleSlot
from app.models.user import User
from app.schemas.schedule import (
    CalendarBookingOut,
    CalendarResponse,
    CalendarSlotOut,
    ScheduleBlockCreate,
    ScheduleBlockOut,
    SlotTimeOption,
    SlotsResponse,
)
from app.services import schedule_service

router = APIRouter(prefix="/schedule", tags=["schedule"])

STAFF_READ = (UserRole.owner, UserRole.admin, UserRole.reception, UserRole.master)
STAFF_WRITE = (UserRole.owner, UserRole.admin, UserRole.master)


def _fmt_time(t: time) -> str:
    return t.strftime("%H:%M")


@router.get("/slots", response_model=SlotsResponse)
async def get_slots(
    db: Annotated[AsyncSession, Depends(get_db)],
    master_id: UUID = Query(...),
    service_id: UUID = Query(...),
    day: date = Query(..., alias="date"),
) -> SlotsResponse:
    """Публичные слоты для бота / Mini App (без auth)."""
    await schedule_service.ensure_master_exists(db, master_id)
    service = await db.get(Service, service_id)
    if service is None:
        raise NotFoundError("Service not found")
    ms = (
        await db.execute(
            select(MasterService).where(
                MasterService.master_id == master_id,
                MasterService.service_id == service_id,
            )
        )
    ).scalar_one_or_none()
    if ms is None:
        raise NotFoundError("Service not offered by this master")
    duration = (
        int(ms.duration_override)
        if ms.duration_override is not None
        else int(service.duration_minutes)
    )
    times = await schedule_service.get_available_slots(
        db,
        master_id,
        day,
        duration,
        apply_lead_time=True,
    )
    candidates = await schedule_service.enumerate_slot_candidates(
        db,
        master_id,
        day,
        duration,
        apply_lead_time=True,
    )
    return SlotsResponse(
        times=[_fmt_time(t) for t in times],
        slots=[SlotTimeOption(time=_fmt_time(tm), available=av) for tm, av in candidates],
    )


@router.get("/calendar", response_model=CalendarResponse)
async def get_calendar(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*STAFF_READ))],
    utc_from: datetime = Query(..., alias="from"),
    utc_to: datetime = Query(..., alias="to"),
    master_id: UUID | None = None,
) -> CalendarResponse:
    if user.role == UserRole.master and user.master_id is not None:
        master_id = user.master_id
    if master_id is not None:
        ensure_master_own_master_id(user, master_id)

    bookings = await schedule_service.get_calendar_bookings(
        db, master_id=master_id, utc_from=utc_from, utc_to=utc_to
    )
    slots = await schedule_service.get_calendar_slots(
        db, master_id=master_id, utc_from=utc_from, utc_to=utc_to
    )
    return CalendarResponse(
        bookings=[
            CalendarBookingOut(
                id=b.id,
                master_id=b.master_id,
                client_id=b.client_id,
                service_id=b.service_id,
                starts_at=b.starts_at,
                ends_at=b.ends_at,
                status=b.status.value,
                price=b.price,
            )
            for b in bookings
        ],
        slots=[
            CalendarSlotOut(
                id=s.id,
                master_id=s.master_id,
                slot_type=s.slot_type.value,
                starts_at=s.starts_at,
                ends_at=s.ends_at,
                note=s.note,
            )
            for s in slots
        ],
    )


@router.post("/block", response_model=ScheduleBlockOut)
async def create_block(
    body: ScheduleBlockCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*STAFF_WRITE))],
) -> ScheduleBlockOut:
    ensure_master_own_master_id(user, body.master_id)
    slot = ScheduleSlot(
        master_id=body.master_id,
        slot_type=body.slot_type,
        starts_at=body.starts_at,
        ends_at=body.ends_at,
        note=body.note,
    )
    db.add(slot)
    await db.flush()
    await db.refresh(slot)
    return ScheduleBlockOut(
        id=slot.id,
        master_id=slot.master_id,
        slot_type=slot.slot_type.value,
        starts_at=slot.starts_at,
        ends_at=slot.ends_at,
        note=slot.note,
    )


@router.delete("/block/{slot_id}", status_code=204)
async def delete_block(
    slot_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*STAFF_WRITE))],
) -> None:
    slot = await db.get(ScheduleSlot, slot_id)
    if slot is None:
        raise NotFoundError("Schedule block not found")
    ensure_master_own_master_id(user, slot.master_id)
    await db.delete(slot)
    await db.flush()


# ── /schedule/week ────────────────────────────────────────────────────────────

_WEEKDAY_KEYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


class WeekBookingItem(BaseModel):
    id: str
    start: str
    end: str
    client_name: str
    service_name: str
    status: str


class WeekBlockItem(BaseModel):
    id: str
    start: str
    end: str
    slot_type: str
    note: str | None


class WeekDayHours(BaseModel):
    day: int  # 0=Mon … 6=Sun
    open: str
    close: str


class WeekMasterData(BaseModel):
    id: str
    name: str
    color: str
    working_hours: list[WeekDayHours]
    bookings: list[WeekBookingItem]
    blocks: list[WeekBlockItem]


class WeekScheduleResponse(BaseModel):
    week_start: str
    week_end: str
    timezone: str
    masters: list[WeekMasterData]


@router.get("/week", response_model=WeekScheduleResponse)
async def get_week_schedule(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*STAFF_READ))],
    date: date = Query(..., description="ISO date — Monday of the desired week"),
    master_id: UUID | None = Query(None),
) -> WeekScheduleResponse:
    """Enriched weekly grid data: masters with working_hours, bookings, blocks."""
    if user.role == UserRole.master and user.master_id is not None:
        master_id = user.master_id
    elif master_id is not None:
        ensure_master_own_master_id(user, master_id)

    salon_row = (await db.execute(select(Salon).limit(1))).scalar_one_or_none()
    tz_name = salon_row.timezone if salon_row else "Europe/Sofia"

    week_start_dt = datetime(date.year, date.month, date.day, 0, 0, 0, tzinfo=UTC)
    week_end_dt = week_start_dt + timedelta(days=7)

    # Fetch masters
    stmt_masters = select(Master).where(Master.is_active.is_(True)).order_by(Master.sort_order)
    if master_id is not None:
        stmt_masters = stmt_masters.where(Master.id == master_id)
    masters_list: list[Master] = list((await db.execute(stmt_masters)).scalars().all())
    master_ids = {m.id for m in masters_list}

    # Fetch bookings in range
    stmt_b = (
        select(Booking)
        .where(Booking.starts_at < week_end_dt, Booking.ends_at > week_start_dt)
        .where(Booking.master_id.in_(master_ids))
        .where(
            Booking.status.in_([
                BookingStatus.pending,
                BookingStatus.confirmed,
                BookingStatus.completed,
            ])
        )
    )
    bookings_all: list[Booking] = list((await db.execute(stmt_b)).scalars().all())

    # Fetch client and service names in bulk
    client_ids = {b.client_id for b in bookings_all}
    service_ids = {b.service_id for b in bookings_all}
    clients_map: dict[UUID, Client] = {}
    services_map: dict[UUID, Service] = {}
    if client_ids:
        rows = (await db.execute(select(Client).where(Client.id.in_(client_ids)))).scalars().all()
        clients_map = {c.id: c for c in rows}
    if service_ids:
        rows_s = (await db.execute(select(Service).where(Service.id.in_(service_ids)))).scalars().all()
        services_map = {s.id: s for s in rows_s}

    # Fetch schedule slots in range
    stmt_s = (
        select(ScheduleSlot)
        .where(ScheduleSlot.starts_at < week_end_dt, ScheduleSlot.ends_at > week_start_dt)
        .where(ScheduleSlot.master_id.in_(master_ids))
    )
    slots_all: list[ScheduleSlot] = list((await db.execute(stmt_s)).scalars().all())

    def _svc_name(svc: Service | None) -> str:
        if not svc:
            return "—"
        ni = svc.name_i18n if isinstance(svc.name_i18n, dict) else {}
        return str(ni.get("ru") or ni.get("en") or "—")

    def _client_name(c: Client | None) -> str:
        if not c:
            return "—"
        return " ".join(x for x in (c.first_name or "", c.last_name or "") if x).strip() or "—"

    def _parse_working_hours(wh: dict[str, Any]) -> list[WeekDayHours]:
        result = []
        for i, key in enumerate(_WEEKDAY_KEYS):
            day_data = wh.get(key, {})
            if not isinstance(day_data, dict):
                continue
            enabled = day_data.get("enabled", True)
            if not enabled:
                continue
            start = str(day_data.get("start") or "10:00")
            end = str(day_data.get("end") or "19:00")
            result.append(WeekDayHours(day=i, open=start, close=end))
        return result

    result_masters = []
    for m in masters_list:
        m_bookings = [b for b in bookings_all if b.master_id == m.id]
        m_slots = [s for s in slots_all if s.master_id == m.id]

        week_bookings = [
            WeekBookingItem(
                id=str(b.id),
                start=b.starts_at.isoformat(),
                end=b.ends_at.isoformat(),
                client_name=_client_name(clients_map.get(b.client_id)),
                service_name=_svc_name(services_map.get(b.service_id)),
                status=b.status.value if hasattr(b.status, "value") else str(b.status),
            )
            for b in m_bookings
        ]
        week_blocks = [
            WeekBlockItem(
                id=str(s.id),
                start=s.starts_at.isoformat(),
                end=s.ends_at.isoformat(),
                slot_type=s.slot_type.value if hasattr(s.slot_type, "value") else str(s.slot_type),
                note=s.note,
            )
            for s in m_slots
        ]
        wh_data = m.working_hours if isinstance(m.working_hours, dict) else {}
        result_masters.append(
            WeekMasterData(
                id=str(m.id),
                name=m.display_name,
                color=m.color_hex,
                working_hours=_parse_working_hours(wh_data),
                bookings=week_bookings,
                blocks=week_blocks,
            )
        )

    week_end_date = date + timedelta(days=6)
    return WeekScheduleResponse(
        week_start=date.isoformat(),
        week_end=week_end_date.isoformat(),
        timezone=tz_name,
        masters=result_masters,
    )
