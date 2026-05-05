"""Бронирования: конфликт слотов (FOR UPDATE), блэклист, master_service, отмена/перенос."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

import app.core.clock as clock
from app.core.exceptions import (
    ClientBlacklistedError,
    ForbiddenScopeError,
    InvalidScheduleError,
    InvalidBookingStateError,
    LateCancellationDeniedError,
    MasterDoesNotOfferServiceError,
    NotFoundError,
    SlotTakenError,
)
from app.core.scope import booking_scope_filter
from app.models.booking import BlacklistEntry, Booking
from app.models.catalog import MasterService, Service
from app.models.client import Client
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
from app.schemas.booking import (
    BookingCreate,
    BookingDetailClientOut,
    BookingDetailMasterOut,
    BookingDetailOut,
    BookingDetailServiceOut,
    BookingOut,
    BookingStatsOut,
    BookingUpdate,
)
from app.services import schedule_service
from app.utils.datetime_utils import ensure_aware

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
    starts_at = ensure_aware(data.starts_at)
    if starts_at is None:
        raise InvalidScheduleError("starts_at is required")

    if await _is_blacklisted(db, data.client_id):
        raise ClientBlacklistedError()

    price, duration_min = await _resolve_pricing(db, data.master_id, data.service_id)
    ends_at = starts_at + timedelta(minutes=duration_min)

    if user.role == UserRole.master:
        if user.master_id != data.master_id:
            raise ForbiddenScopeError("Cannot create booking for another master")

    if data.created_via == BookingCreatedVia.bot:
        await schedule_service.validate_booking_window(
            db,
            master_id=data.master_id,
            starts_at=starts_at,
            ends_at=ends_at,
            created_via=data.created_via,
            exclude_booking_id=None,
        )
    elif data.created_via in (BookingCreatedVia.admin, BookingCreatedVia.manual):
        await schedule_service.validate_booking_window(
            db,
            master_id=data.master_id,
            starts_at=starts_at,
            ends_at=ends_at,
            created_via=BookingCreatedVia.admin,
            exclude_booking_id=None,
        )

    await _assert_slot_free(
        db,
        master_id=data.master_id,
        starts_at=starts_at,
        ends_at=ends_at,
    )

    b = Booking(
        client_id=data.client_id,
        master_id=data.master_id,
        service_id=data.service_id,
        starts_at=starts_at,
        ends_at=ends_at,
        status=BookingStatus.pending,
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


def _status_filter_clause(status: str | None):
    if status is None or status == "" or status == "all":
        return None
    if status == "cancelled":
        return Booking.status.in_(
            (BookingStatus.cancelled_by_client, BookingStatus.cancelled_by_salon)
        )
    try:
        st = BookingStatus(status)
    except ValueError:
        return None
    return Booking.status == st


async def list_bookings(
    db: AsyncSession,
    user: User,
    *,
    q: str | None,
    page: int,
    page_size: int,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    master_id: UUID | None = None,
    service_id: UUID | None = None,
    status: str | None = None,
    needs_consultation: bool | None = None,
) -> tuple[list[Booking], int]:
    base_scope = booking_scope_filter(user)
    stmt = select(Booking).where(base_scope)
    count_stmt = select(func.count(Booking.id.distinct())).select_from(Booking).where(base_scope)

    if needs_consultation is not None:
        stmt = stmt.where(Booking.needs_consultation == needs_consultation)
        count_stmt = count_stmt.where(Booking.needs_consultation == needs_consultation)
    if date_from is not None:
        stmt = stmt.where(Booking.starts_at >= date_from)
        count_stmt = count_stmt.where(Booking.starts_at >= date_from)
    if date_to is not None:
        stmt = stmt.where(Booking.starts_at < date_to)
        count_stmt = count_stmt.where(Booking.starts_at < date_to)
    if master_id is not None:
        stmt = stmt.where(Booking.master_id == master_id)
        count_stmt = count_stmt.where(Booking.master_id == master_id)
    if service_id is not None:
        stmt = stmt.where(Booking.service_id == service_id)
        count_stmt = count_stmt.where(Booking.service_id == service_id)
    st_clause = _status_filter_clause(status)
    if st_clause is not None:
        stmt = stmt.where(st_clause)
        count_stmt = count_stmt.where(st_clause)
    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.join(Client, Client.id == Booking.client_id).where(
            or_(
                Booking.notes.ilike(pattern),
                Client.first_name.ilike(pattern),
                Client.last_name.ilike(pattern),
                Client.phone.ilike(pattern),
            )
        )
        count_stmt = (
            select(func.count(Booking.id.distinct()))
            .select_from(Booking)
            .join(Client, Client.id == Booking.client_id)
            .where(base_scope)
        )
        if date_from is not None:
            count_stmt = count_stmt.where(Booking.starts_at >= date_from)
        if date_to is not None:
            count_stmt = count_stmt.where(Booking.starts_at < date_to)
        if master_id is not None:
            count_stmt = count_stmt.where(Booking.master_id == master_id)
        if service_id is not None:
            count_stmt = count_stmt.where(Booking.service_id == service_id)
        if st_clause is not None:
            count_stmt = count_stmt.where(st_clause)
        count_stmt = count_stmt.where(
            or_(
                Booking.notes.ilike(pattern),
                Client.first_name.ilike(pattern),
                Client.last_name.ilike(pattern),
                Client.phone.ilike(pattern),
            )
        )

    total = int((await db.execute(count_stmt)).scalar_one())
    stmt = (
        stmt.order_by(Booking.starts_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows), total


async def booking_stats(
    db: AsyncSession,
    user: User,
    *,
    timezone_name: str,
) -> BookingStatsOut:
    """KPI: сегодня / неделя (пн–вс) / месяц / отмены за текущий месяц (по cancelled_at)."""
    z = ZoneInfo(timezone_name)
    now_local = datetime.now(z)
    today_start = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)
    weekday = today_start.weekday()
    week_start = today_start - timedelta(days=weekday)
    week_end = week_start + timedelta(days=7)
    month_start = today_start.replace(day=1)
    if month_start.month == 12:
        month_end = month_start.replace(year=month_start.year + 1, month=1, day=1)
    else:
        month_end = month_start.replace(month=month_start.month + 1, day=1)

    utc_t0 = today_start.astimezone(UTC)
    utc_t1 = today_end.astimezone(UTC)
    utc_w0 = week_start.astimezone(UTC)
    utc_w1 = week_end.astimezone(UTC)
    utc_m0 = month_start.astimezone(UTC)
    utc_m1 = month_end.astimezone(UTC)

    scope = booking_scope_filter(user)

    async def _count(where_clause):
        stmt = select(func.count(Booking.id)).where(scope).where(where_clause)
        return int((await db.execute(stmt)).scalar_one())

    today_n = await _count(and_(Booking.starts_at >= utc_t0, Booking.starts_at < utc_t1))
    week_n = await _count(and_(Booking.starts_at >= utc_w0, Booking.starts_at < utc_w1))
    month_n = await _count(and_(Booking.starts_at >= utc_m0, Booking.starts_at < utc_m1))
    cancel_n = await _count(
        and_(
            Booking.status.in_(
                (BookingStatus.cancelled_by_client, BookingStatus.cancelled_by_salon)
            ),
            Booking.cancelled_at.is_not(None),
            Booking.cancelled_at >= utc_m0,
            Booking.cancelled_at < utc_m1,
        )
    )
    return BookingStatsOut(
        today=today_n,
        week=week_n,
        month=month_n,
        cancellations=cancel_n,
    )


async def get_booking_detail(db: AsyncSession, user: User, booking_id: UUID) -> BookingDetailOut:
    b = await get_booking(db, user, booking_id)
    client = await db.get(Client, b.client_id)
    service = await db.get(Service, b.service_id)
    if client is None or service is None:
        raise NotFoundError("Booking relation not found")
    master = await db.get(Master, b.master_id) if b.master_id else None
    base = BookingOut.model_validate(b)
    return BookingDetailOut(
        **base.model_dump(),
        client=BookingDetailClientOut(
            id=client.id,
            first_name=client.first_name,
            last_name=client.last_name,
            phone=client.phone,
            tg_username=client.tg_username,
        ),
        master=BookingDetailMasterOut(
            id=master.id,
            display_name=master.display_name,
            color_hex=master.color_hex,
        ) if master else None,
        service=BookingDetailServiceOut(
            id=service.id,
            name_i18n=dict(service.name_i18n or {}),
            duration_minutes=int(service.duration_minutes),
        ),
    )


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

    changing_time = "starts_at" in payload or "ends_at" in payload
    if changing_time:
        new_start = ensure_aware(payload.get("starts_at", b.starts_at))
        effective_master_id = payload.get("master_id", b.master_id)
        # Compute ends_at from duration when only starts_at is provided
        # (covers consultation bookings where b.ends_at is NULL)
        if "starts_at" in payload and "ends_at" not in payload:
            _, duration_min = await _resolve_pricing(db, effective_master_id, b.service_id)
            new_end = new_start + timedelta(minutes=duration_min) if new_start else None
        else:
            new_end = ensure_aware(payload.get("ends_at", b.ends_at))
        if new_start is None or new_end is None:
            raise InvalidScheduleError("starts_at and ends_at are required")
        if effective_master_id:
            await _assert_slot_free(
                db,
                master_id=effective_master_id,
                starts_at=new_start,
                ends_at=new_end,
                exclude_booking_id=b.id,
            )
        if "ends_at" not in payload and "starts_at" in payload:
            payload["ends_at"] = new_end

    for k, v in payload.items():
        setattr(b, k, v)
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

    # Consultation bookings have no starts_at — allow free cancellation
    hours_left = (b.starts_at - now).total_seconds() / 3600.0 if b.starts_at else float("inf")
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

    aware_starts = ensure_aware(new_starts_at)
    if aware_starts is None:
        raise InvalidScheduleError("new_starts_at is required")
    _, duration_min = await _resolve_pricing(db, b.master_id, b.service_id)
    new_ends = aware_starts + timedelta(minutes=duration_min)

    if b.created_via == BookingCreatedVia.bot:
        await schedule_service.validate_booking_window(
            db,
            master_id=b.master_id,
            starts_at=aware_starts,
            ends_at=new_ends,
            created_via=b.created_via,
            exclude_booking_id=b.id,
        )

    await _assert_slot_free(
        db,
        master_id=b.master_id,
        starts_at=aware_starts,
        ends_at=new_ends,
        exclude_booking_id=b.id,
    )
    b.starts_at = aware_starts
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


async def confirm_booking(db: AsyncSession, user: User, booking_id: UUID) -> Booking:
    b = await get_booking(db, user, booking_id)
    if b.status != BookingStatus.pending:
        raise InvalidBookingStateError("Только записи в статусе pending можно подтверждать")
    b.status = BookingStatus.confirmed
    await db.flush()
    return b


async def reject_booking(
    db: AsyncSession, user: User, booking_id: UUID, reason: str | None = None
) -> Booking:
    b = await get_booking(db, user, booking_id)
    if b.status in (
        BookingStatus.cancelled_by_client,
        BookingStatus.cancelled_by_salon,
        BookingStatus.completed,
    ):
        raise InvalidBookingStateError("Запись уже отменена или завершена")
    b.status = BookingStatus.cancelled_by_salon
    if reason:
        b.cancellation_reason = reason
    await db.flush()
    return b
