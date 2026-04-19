"""Бронирования: конфликт слотов (FOR UPDATE), блэклист, master_service, отмена/перенос."""

from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal
from typing import Literal
from uuid import UUID

from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

import app.core.clock as clock
from app.core.exceptions import (
    ClientBlacklistedError,
    ForbiddenScopeError,
    InvalidBookingStateError,
    LateCancellationDeniedError,
    MasterDoesNotOfferServiceError,
    NotFoundError,
    SlotTakenError,
)
from app.core.scope import booking_scope_filter
from app.models.booking import BlacklistEntry, Booking
from app.models.catalog import MasterService, Service
from app.models.enums import (
    BookingCreatedVia,
    BookingStatus,
    LateCancellationPolicy,
    PrepaymentStatus,
    UserRole,
)
from app.models.master import Master
from app.models.salon import Settings
from app.models.user import User
from app.schemas.booking import BookingCreate, BookingUpdate
from app.services import schedule_service

_ACTIVE = (BookingStatus.pending, BookingStatus.confirmed)


async def _lock_master_row(db: AsyncSession, master_id: UUID) -> None:
    await db.execute(select(Master.id).where(Master.id == master_id).with_for_update())


async def _select_overlapping_bookings_for_update(
    db: AsyncSession,
    *,
    master_id: UUID,
    starts_at: datetime,
    ends_at: datetime,
    exclude_booking_id: UUID | None = None,
) -> list[UUID]:
    """Строки броней, пересекающиеся с окном (pending/confirmed), FOR UPDATE."""
    conds = [
        Booking.master_id == master_id,
        Booking.status.in_(_ACTIVE),
        Booking.starts_at < ends_at,
        Booking.ends_at > starts_at,
    ]
    if exclude_booking_id is not None:
        conds.append(Booking.id != exclude_booking_id)
    stmt = select(Booking.id).where(and_(*conds)).with_for_update()
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows)


async def _assert_slot_free(
    db: AsyncSession,
    *,
    master_id: UUID,
    starts_at: datetime,
    ends_at: datetime,
    exclude_booking_id: UUID | None = None,
) -> None:
    """Сериализация по мастеру + блокировка пересечений (см. 03_DATABASE_SCHEMA)."""
    await _lock_master_row(db, master_id)
    overlap_ids = await _select_overlapping_bookings_for_update(
        db,
        master_id=master_id,
        starts_at=starts_at,
        ends_at=ends_at,
        exclude_booking_id=exclude_booking_id,
    )
    if overlap_ids:
        raise SlotTakenError()


async def _is_blacklisted(db: AsyncSession, client_id: UUID) -> bool:
    now = clock.utc_now()
    n = await db.scalar(
        select(func.count(BlacklistEntry.id)).where(
            BlacklistEntry.client_id == client_id,
            or_(BlacklistEntry.expires_at.is_(None), BlacklistEntry.expires_at > now),
        )
    )
    return bool(n and n > 0)


async def _resolve_pricing(
    db: AsyncSession, master_id: UUID, service_id: UUID
) -> tuple[Decimal, int]:
    svc = await db.get(Service, service_id)
    if svc is None:
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
        raise MasterDoesNotOfferServiceError()
    price = ms.price_override if ms.price_override is not None else svc.price
    duration = ms.duration_override if ms.duration_override is not None else svc.duration_minutes
    return Decimal(price), int(duration)


async def create_booking(db: AsyncSession, user: User, data: BookingCreate) -> Booking:
    if await _is_blacklisted(db, data.client_id):
        raise ClientBlacklistedError()

    price, duration_min = await _resolve_pricing(db, data.master_id, data.service_id)
    ends_at = data.starts_at + timedelta(minutes=duration_min)

    if user.role == UserRole.master:
        if user.master_id != data.master_id:
            raise ForbiddenScopeError("Cannot create booking for another master")

    if data.created_via == BookingCreatedVia.bot:
        await schedule_service.validate_booking_window(
            db,
            master_id=data.master_id,
            starts_at=data.starts_at,
            ends_at=ends_at,
            created_via=data.created_via,
            exclude_booking_id=None,
        )

    await _assert_slot_free(
        db,
        master_id=data.master_id,
        starts_at=data.starts_at,
        ends_at=ends_at,
    )

    b = Booking(
        client_id=data.client_id,
        master_id=data.master_id,
        service_id=data.service_id,
        starts_at=data.starts_at,
        ends_at=ends_at,
        status=BookingStatus.confirmed,
        price=price,
        prepayment_status=PrepaymentStatus.none,
        notes=data.notes,
        created_via=data.created_via,
    )
    db.add(b)
    try:
        await db.flush()
    except IntegrityError as e:
        raise MasterDoesNotOfferServiceError("Invalid booking data") from e
    await db.refresh(b)
    return b


async def list_bookings(
    db: AsyncSession,
    user: User,
    *,
    q: str | None,
    page: int,
    page_size: int,
) -> tuple[list[Booking], int]:
    stmt = select(Booking).where(booking_scope_filter(user))
    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(Booking.notes.ilike(pattern))
    count_stmt = select(func.count(Booking.id)).where(booking_scope_filter(user))
    if q:
        pattern = f"%{q.strip()}%"
        count_stmt = count_stmt.where(Booking.notes.ilike(pattern))
    total = int((await db.execute(count_stmt)).scalar_one())
    stmt = (
        stmt.order_by(Booking.starts_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows), total


async def get_booking(db: AsyncSession, user: User, booking_id: UUID) -> Booking:
    stmt = select(Booking).where(Booking.id == booking_id).where(booking_scope_filter(user))
    b = (await db.execute(stmt)).scalar_one_or_none()
    if b is None:
        raise NotFoundError("Booking not found")
    return b


async def update_booking(
    db: AsyncSession, user: User, booking_id: UUID, data: BookingUpdate
) -> Booking:
    b = await get_booking(db, user, booking_id)
    payload = data.model_dump(exclude_unset=True)
    new_start = payload.get("starts_at", b.starts_at)
    new_end = payload.get("ends_at", b.ends_at)
    if "starts_at" in payload and "ends_at" not in payload:
        _, duration_min = await _resolve_pricing(db, b.master_id, b.service_id)
        new_end = new_start + timedelta(minutes=duration_min)
    if "starts_at" in payload or "ends_at" in payload:
        await _assert_slot_free(
            db,
            master_id=b.master_id,
            starts_at=new_start,
            ends_at=new_end,
            exclude_booking_id=b.id,
        )
    for k, v in payload.items():
        setattr(b, k, v)
    if "starts_at" in payload and "ends_at" not in payload:
        b.ends_at = new_end
    await db.flush()
    return b


async def delete_booking(db: AsyncSession, user: User, booking_id: UUID) -> None:
    b = await get_booking(db, user, booking_id)
    try:
        await db.delete(b)
        await db.flush()
    except IntegrityError as e:
        from app.core.exceptions import ConflictError

        raise ConflictError("Cannot delete booking", code="booking_delete_blocked") from e


async def _load_settings(db: AsyncSession) -> Settings | None:
    return (await db.execute(select(Settings).limit(1))).scalar_one_or_none()


async def cancel_booking(
    db: AsyncSession,
    user: User,
    booking_id: UUID,
    *,
    actor: Literal["user", "client"],
    reason: str | None = None,
) -> Booking:
    b = await get_booking(db, user, booking_id)
    if b.status not in _ACTIVE:
        raise InvalidBookingStateError("Booking is not active")

    now = clock.utc_now()
    if actor == "user":
        b.status = BookingStatus.cancelled_by_salon
        b.cancelled_at = now
        b.cancellation_reason = reason
        await db.flush()
        return b

    settings = await _load_settings(db)
    free_h = settings.cancellation_free_hours if settings else 24
    policy = settings.late_cancellation_policy if settings else LateCancellationPolicy.no_cancel
    fine_amt = settings.fine_amount if settings else None

    hours_left = (b.starts_at - now).total_seconds() / 3600.0
    if hours_left >= free_h:
        b.status = BookingStatus.cancelled_by_client
        b.cancelled_at = now
        b.cancellation_reason = reason
        await db.flush()
        return b

    if policy == LateCancellationPolicy.no_cancel:
        raise LateCancellationDeniedError()

    extra = ""
    if policy == LateCancellationPolicy.fine and fine_amt is not None:
        extra = f" Late cancellation fine: {fine_amt}."
        b.cancellation_reason = (reason or "").strip() + extra
    elif policy == LateCancellationPolicy.fine:
        b.cancellation_reason = reason
    else:
        b.cancellation_reason = reason

    b.status = BookingStatus.cancelled_by_client
    b.cancelled_at = now

    if policy == LateCancellationPolicy.blacklist:
        existing = (
            await db.execute(select(BlacklistEntry.id).where(BlacklistEntry.client_id == b.client_id))
        ).scalar_one_or_none()
        if existing is None:
            db.add(
                BlacklistEntry(
                    client_id=b.client_id,
                    reason="Late cancellation policy",
                    added_by_user_id=user.id,
                )
            )

    await db.flush()
    return b


async def reschedule_booking(
    db: AsyncSession, user: User, booking_id: UUID, new_starts_at: datetime
) -> Booking:
    b = await get_booking(db, user, booking_id)
    if b.status not in _ACTIVE:
        raise InvalidBookingStateError("Booking is not active")

    _, duration_min = await _resolve_pricing(db, b.master_id, b.service_id)
    new_ends = new_starts_at + timedelta(minutes=duration_min)

    if b.created_via == BookingCreatedVia.bot:
        await schedule_service.validate_booking_window(
            db,
            master_id=b.master_id,
            starts_at=new_starts_at,
            ends_at=new_ends,
            created_via=b.created_via,
            exclude_booking_id=b.id,
        )

    await _assert_slot_free(
        db,
        master_id=b.master_id,
        starts_at=new_starts_at,
        ends_at=new_ends,
        exclude_booking_id=b.id,
    )
    b.starts_at = new_starts_at
    b.ends_at = new_ends
    await db.flush()
    return b


async def mark_completed(db: AsyncSession, user: User, booking_id: UUID) -> Booking:
    b = await get_booking(db, user, booking_id)
    if b.status not in _ACTIVE:
        raise InvalidBookingStateError("Booking is not active")
    b.status = BookingStatus.completed
    await db.flush()
    return b


async def mark_no_show(db: AsyncSession, user: User, booking_id: UUID) -> Booking:
    b = await get_booking(db, user, booking_id)
    if b.status not in _ACTIVE:
        raise InvalidBookingStateError("Booking is not active")
    b.status = BookingStatus.no_show
    await db.flush()
    return b
