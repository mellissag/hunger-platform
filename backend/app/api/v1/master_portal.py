"""Master Portal — эндпоинты для пространства /m/."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.user_page_permissions import merged_permissions
from app.deps import get_db, require_roles
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


def _dashboard_booking_scope(master_id: UUID, *, own_clients_only: bool):
    """Фильтр записей для дешборда: только свои master_id или + общие слоты any_master без мастера."""
    assigned = Booking.master_id == master_id
    if own_clients_only:
        return assigned
    return or_(assigned, and_(Booking.any_master.is_(True), Booking.master_id.is_(None)))


def _dash_flag(tree: dict[str, Any], key: str, *, default: bool = True) -> bool:
    block = tree.get("master_dashboard")
    if not isinstance(block, dict) or not bool(block.get("enabled")):
        return False
    if key == "enabled":
        return bool(block.get("enabled"))
    return bool(block.get(key, default))


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
    own_clients_only: bool,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    statuses: list[BookingStatus] | None = None,
    limit: int = 200,
    offset: int = 0,
) -> list[BookingBrief]:
    scope = _dashboard_booking_scope(master_id, own_clients_only=own_clients_only)
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
        .where(scope)
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
        result.append(
            BookingBrief(
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
            )
        )
    return result


def _brief_public_dict(b: BookingBrief, *, show_names: bool) -> dict[str, Any]:
    d = b.model_dump()
    if not show_names:
        d["client_name"] = None
        d["client_phone"] = None
    return d


# ── Dashboard (мастер /m/dashboard) ─────────────────────────────────────────

@router.get("/dashboard")
async def master_dashboard(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(_MASTER)],
) -> dict[str, Any]:
    master = await _require_master(user, db)
    tree = merged_permissions(user)
    if not _dash_flag(tree, "enabled", default=False):
        raise HTTPException(status_code=403, detail="Master dashboard is disabled for this user")

    own_only = _dash_flag(tree, "own_clients_only", default=True)
    show_names = _dash_flag(tree, "show_client_names", default=True)
    show_kpi_bookings = _dash_flag(tree, "show_kpi_bookings_today", default=True)
    show_kpi_pending = _dash_flag(tree, "show_kpi_pending", default=True)
    show_kpi_revenue = _dash_flag(tree, "show_kpi_revenue_today", default=True)
    show_kpi_clients = _dash_flag(tree, "show_kpi_total_clients", default=True)
    show_today = _dash_flag(tree, "show_section_today", default=True)
    show_upcoming = _dash_flag(tree, "show_section_upcoming", default=True)

    today_start, today_end = _today_utc_range()
    now = datetime.now(tz=timezone.utc)

    today_bookings: list[BookingBrief] = []
    upcoming: list[BookingBrief] = []
    if show_today or show_kpi_bookings or show_kpi_pending or show_kpi_revenue:
        today_bookings = await _load_bookings_brief(
            db,
            master.id,
            own_clients_only=own_only,
            date_from=today_start,
            date_to=today_end,
        )
    if show_upcoming:
        upcoming = await _load_bookings_brief(
            db,
            master.id,
            own_clients_only=own_only,
            date_from=now,
            statuses=[BookingStatus.pending, BookingStatus.confirmed],
            limit=5,
        )

    today_revenue = Decimal("0")
    pending_count = 0
    if show_kpi_revenue or show_kpi_pending or show_kpi_bookings:
        for b in today_bookings:
            if show_kpi_pending and b.status == BookingStatus.pending.value:
                pending_count += 1
            if show_kpi_revenue and b.status == BookingStatus.completed.value:
                today_revenue += b.price

    total_clients = 0
    if show_kpi_clients:
        scope = _dashboard_booking_scope(master.id, own_clients_only=own_only)
        total_clients_row = await db.execute(
            select(func.count(func.distinct(Booking.client_id))).where(scope)
        )
        total_clients = int(total_clients_row.scalar_one() or 0)

    n_today = len(today_bookings)
    return {
        "today_bookings": [_brief_public_dict(b, show_names=show_names) for b in today_bookings]
        if show_today
        else [],
        "today_bookings_count": n_today
        if (show_today or show_kpi_bookings or show_kpi_pending or show_kpi_revenue)
        else 0,
        "upcoming_bookings": [_brief_public_dict(b, show_names=show_names) for b in upcoming]
        if show_upcoming
        else [],
        "today_revenue": float(today_revenue) if show_kpi_revenue else 0.0,
        "total_clients": total_clients if show_kpi_clients else 0,
        "pending_count": pending_count if show_kpi_pending else 0,
        "flags": {
            "show_kpi_bookings_today": show_kpi_bookings,
            "show_kpi_pending": show_kpi_pending,
            "show_kpi_revenue_today": show_kpi_revenue,
            "show_kpi_total_clients": show_kpi_clients,
            "show_section_today": show_today,
            "show_section_upcoming": show_upcoming,
        },
    }
