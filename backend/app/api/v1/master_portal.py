"""Master Portal — эндпоинты для пространства /m/."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db, require_roles
from app.models.booking import Booking
from app.models.catalog import Service
from app.models.client import Client
from app.models.enums import BookingStatus, UserRole
from app.models.master import Master
from app.models.user import User

router = APIRouter(prefix="/master", tags=["master-portal"])

_MASTER = require_roles(UserRole.master)


def _today_utc_range() -> tuple[datetime, datetime]:
    now = datetime.now(tz=timezone.utc)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    return start, end


async def _require_master(user: User, db: AsyncSession) -> Master:
    if not user.master_id:
        raise HTTPException(status_code=403, detail="User has no master profile")
    m = await db.get(Master, user.master_id)
    if not m:
        raise HTTPException(status_code=404, detail="Master profile not found")
    return m


class BookingBrief(BaseModel):
    model_config = ConfigDict(from_attributes=False)

    id: UUID
    client_id: UUID
    client_name: str | None
    client_phone: str | None
    service_id: UUID
    service_name: str | None
    starts_at: datetime | None
    ends_at: datetime | None
    status: str
    price: Decimal
    notes: str | None


async def _load_bookings_brief(
    db: AsyncSession,
    master_id: UUID,
    *,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    statuses: list[BookingStatus] | None = None,
    limit: int = 200,
    offset: int = 0,
) -> list[BookingBrief]:
    stmt = (
        select(
            Booking,
            Client.first_name,
            Client.last_name,
            Client.phone,
            Service.name_i18n,
        )
        .join(Client, Client.id == Booking.client_id)
        .join(Service, Service.id == Booking.service_id)
        .where(Booking.master_id == master_id)
    )
    if date_from:
        stmt = stmt.where(Booking.starts_at >= date_from)
    if date_to:
        stmt = stmt.where(Booking.starts_at < date_to)
    if statuses:
        stmt = stmt.where(Booking.status.in_(statuses))
    stmt = stmt.order_by(Booking.starts_at).limit(limit).offset(offset)

    rows = (await db.execute(stmt)).all()
    result: list[BookingBrief] = []
    for row in rows:
        b: Booking = row[0]
        fn, ln, phone = row[1], row[2], row[3]
        name_i18n: dict | None = row[4]
        service_name = (
            (name_i18n or {}).get("ru")
            or (name_i18n or {}).get("en")
            or None
        )
        client_name = " ".join(filter(None, [fn, ln])) or None
        result.append(BookingBrief(
            id=b.id,
            client_id=b.client_id,
            client_name=client_name,
            client_phone=phone,
            service_id=b.service_id,
            service_name=service_name,
            starts_at=b.starts_at,
            ends_at=b.ends_at,
            status=b.status.value,
            price=b.price,
            notes=b.notes,
        ))
    return result


# ── Dashboard ("Мой день") ─────────────────────────────────────────────────

@router.get("/dashboard")
async def master_dashboard(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(_MASTER)],
) -> dict[str, Any]:
    master = await _require_master(user, db)
    today_start, today_end = _today_utc_range()
    now = datetime.now(tz=timezone.utc)

    today_bookings = await _load_bookings_brief(
        db, master.id, date_from=today_start, date_to=today_end
    )
    upcoming = await _load_bookings_brief(
        db, master.id,
        date_from=now,
        statuses=[BookingStatus.pending, BookingStatus.confirmed],
        limit=5,
    )

    today_revenue = sum(
        b.price for b in today_bookings if b.status == BookingStatus.completed.value
    )
    pending_count = sum(
        1 for b in today_bookings if b.status == BookingStatus.pending.value
    )

    total_clients_row = await db.execute(
        select(func.count(func.distinct(Booking.client_id))).where(
            Booking.master_id == master.id
        )
    )
    total_clients = total_clients_row.scalar_one() or 0

    return {
        "today_bookings": [b.model_dump() for b in today_bookings],
        "upcoming_bookings": [b.model_dump() for b in upcoming],
        "today_revenue": float(today_revenue),
        "total_clients": total_clients,
        "pending_count": pending_count,
    }
