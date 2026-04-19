"""Слоты и календарь."""

from __future__ import annotations

from datetime import date, datetime, time
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.core.scope import ensure_master_own_master_id
from app.deps import get_db, require_roles
from app.models.catalog import MasterService, Service
from app.models.enums import UserRole
from app.models.schedule import ScheduleSlot
from app.models.user import User
from app.schemas.schedule import (
    CalendarBookingOut,
    CalendarResponse,
    CalendarSlotOut,
    ScheduleBlockCreate,
    ScheduleBlockOut,
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
    return SlotsResponse(times=[_fmt_time(t) for t in times])


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
                starts_at=b.starts_at,
                ends_at=b.ends_at,
                status=b.status.value,
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
