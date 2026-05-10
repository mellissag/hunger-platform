"""Master Portal — все эндпоинты для пространства /m/."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db, require_roles
from app.models.booking import Booking
from app.models.catalog import MasterService, Service
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


# ── Shared mini-schema ─────────────────────────────────────────────────────

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


# ── Dashboard ──────────────────────────────────────────────────────────────

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


# ── Schedule ───────────────────────────────────────────────────────────────

@router.get("/schedule")
async def master_schedule(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(_MASTER)],
    week_start: date | None = Query(None),
) -> dict[str, Any]:
    master = await _require_master(user, db)

    if week_start is None:
        today = datetime.now(tz=timezone.utc).date()
        week_start = today - timedelta(days=today.weekday())

    week_start_dt = datetime(week_start.year, week_start.month, week_start.day, tzinfo=timezone.utc)
    week_end_dt = week_start_dt + timedelta(days=7)

    bookings = await _load_bookings_brief(
        db, master.id, date_from=week_start_dt, date_to=week_end_dt, limit=200
    )

    return {
        "week_start": week_start.isoformat(),
        "work_hours": master.working_hours or {},
        "bookings": [b.model_dump() for b in bookings],
    }


# ── Clients ────────────────────────────────────────────────────────────────

class MasterClientOut(BaseModel):
    id: UUID
    first_name: str | None
    last_name: str | None
    phone: str | None
    total_bookings: int
    total_revenue: Decimal
    last_visit_at: datetime | None


@router.get("/clients", response_model=dict)
async def master_clients(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(_MASTER)],
    search: str = Query(""),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
) -> dict[str, Any]:
    master = await _require_master(user, db)

    base = (
        select(
            Client.id,
            Client.first_name,
            Client.last_name,
            Client.phone,
            func.count(Booking.id).label("total_bookings"),
            func.coalesce(func.sum(Booking.price), 0).label("total_revenue"),
            func.max(Booking.starts_at).label("last_visit_at"),
        )
        .join(Booking, (Booking.client_id == Client.id) & (Booking.master_id == master.id))
        .group_by(Client.id, Client.first_name, Client.last_name, Client.phone)
    )

    if search.strip():
        q = f"%{search.strip()}%"
        base = base.where(
            (Client.first_name.ilike(q))
            | (Client.last_name.ilike(q))
            | (Client.phone.ilike(q))
        )

    count_stmt = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_stmt)).scalar_one() or 0

    rows = (
        await db.execute(
            base.order_by(func.max(Booking.starts_at).desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()

    items = [
        MasterClientOut(
            id=r.id,
            first_name=r.first_name,
            last_name=r.last_name,
            phone=r.phone,
            total_bookings=r.total_bookings,
            total_revenue=r.total_revenue,
            last_visit_at=r.last_visit_at,
        ).model_dump()
        for r in rows
    ]

    return {"items": items, "total": total, "page": page, "page_size": page_size}


# ── Bookings ───────────────────────────────────────────────────────────────

@router.get("/bookings", response_model=dict)
async def master_bookings(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(_MASTER)],
    status: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
) -> dict[str, Any]:
    master = await _require_master(user, db)

    statuses = None
    if status:
        try:
            statuses = [BookingStatus(status)]
        except ValueError:
            pass

    df = datetime(date_from.year, date_from.month, date_from.day, tzinfo=timezone.utc) if date_from else None
    dt = datetime(date_to.year, date_to.month, date_to.day, tzinfo=timezone.utc) + timedelta(days=1) if date_to else None

    # Count
    count_stmt = (
        select(func.count())
        .select_from(Booking)
        .where(Booking.master_id == master.id)
    )
    if statuses:
        count_stmt = count_stmt.where(Booking.status.in_(statuses))
    if df:
        count_stmt = count_stmt.where(Booking.starts_at >= df)
    if dt:
        count_stmt = count_stmt.where(Booking.starts_at < dt)

    total = (await db.execute(count_stmt)).scalar_one() or 0

    items = await _load_bookings_brief(
        db, master.id,
        date_from=df, date_to=dt,
        statuses=statuses,
        limit=page_size,
        offset=(page - 1) * page_size,
    )

    return {
        "items": [b.model_dump() for b in items],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


# ── Statistics ─────────────────────────────────────────────────────────────

@router.get("/statistics")
async def master_statistics(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(_MASTER)],
) -> dict[str, Any]:
    master = await _require_master(user, db)
    now = datetime.now(tz=timezone.utc)

    # Revenue by month (last 6 months)
    six_months_ago = (now - timedelta(days=180)).replace(day=1, hour=0, minute=0, second=0)
    rev_rows = (
        await db.execute(
            select(
                func.date_trunc("month", Booking.starts_at).label("month"),
                func.coalesce(func.sum(Booking.price), 0).label("revenue"),
                func.count(Booking.id).label("bookings"),
            )
            .where(
                Booking.master_id == master.id,
                Booking.status == BookingStatus.completed,
                Booking.starts_at >= six_months_ago,
            )
            .group_by("month")
            .order_by("month")
        )
    ).all()
    revenue_by_month = [
        {"month": r.month.strftime("%Y-%m"), "revenue": float(r.revenue), "bookings": r.bookings}
        for r in rev_rows
    ]

    # Top services
    top_rows = (
        await db.execute(
            select(
                Service.id,
                Service.name_i18n,
                func.count(Booking.id).label("cnt"),
                func.coalesce(func.sum(Booking.price), 0).label("rev"),
            )
            .join(Booking, Booking.service_id == Service.id)
            .where(
                Booking.master_id == master.id,
                Booking.status == BookingStatus.completed,
            )
            .group_by(Service.id, Service.name_i18n)
            .order_by(func.count(Booking.id).desc())
            .limit(5)
        )
    ).all()
    top_services = [
        {
            "service_id": str(r.id),
            "name": (r.name_i18n or {}).get("ru") or (r.name_i18n or {}).get("en") or "—",
            "count": r.cnt,
            "revenue": float(r.rev),
        }
        for r in top_rows
    ]

    # Totals
    totals = (
        await db.execute(
            select(
                func.count(Booking.id).label("total"),
                func.coalesce(func.sum(Booking.price), 0).label("revenue"),
            )
            .where(
                Booking.master_id == master.id,
                Booking.status == BookingStatus.completed,
            )
        )
    ).one()

    total_bookings = totals.total or 0
    total_revenue = float(totals.revenue or 0)
    avg_check = total_revenue / total_bookings if total_bookings else 0

    # Repeat clients %
    all_clients = (
        await db.execute(
            select(func.count(func.distinct(Booking.client_id))).where(
                Booking.master_id == master.id
            )
        )
    ).scalar_one() or 0

    repeat_clients = (
        await db.execute(
            select(func.count())
            .select_from(
                select(Booking.client_id)
                .where(Booking.master_id == master.id)
                .group_by(Booking.client_id)
                .having(func.count(Booking.id) > 1)
                .subquery()
            )
        )
    ).scalar_one() or 0

    repeat_pct = (repeat_clients / all_clients * 100) if all_clients else 0

    return {
        "revenue_by_month": revenue_by_month,
        "top_services": top_services,
        "total_bookings": total_bookings,
        "total_revenue": total_revenue,
        "avg_check": round(avg_check, 2),
        "avg_rating": float(master.rating_avg or 0),
        "repeat_clients_pct": round(repeat_pct, 1),
        "total_clients": all_clients,
    }


# ── Profile ────────────────────────────────────────────────────────────────

class MasterProfileOut(BaseModel):
    id: UUID
    display_name: str
    bio: dict
    photo_url: str | None
    specialization: dict
    rating_avg: float | None
    rating_count: int
    color_hex: str
    working_hours: dict
    phone: str | None
    services: list[dict]


class MasterProfilePatch(BaseModel):
    display_name: str | None = None
    bio: dict | None = None
    phone: str | None = None
    color_hex: str | None = None
    working_hours: dict | None = None


@router.get("/profile", response_model=MasterProfileOut)
async def master_profile(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(_MASTER)],
) -> MasterProfileOut:
    master = await _require_master(user, db)

    # Services
    svc_rows = (
        await db.execute(
            select(Service.id, Service.name_i18n, MasterService.price_override)
            .join(MasterService, MasterService.service_id == Service.id)
            .where(MasterService.master_id == master.id)
            .order_by(Service.sort_order)
        )
    ).all()
    services = [
        {
            "id": str(r.id),
            "name": (r.name_i18n or {}).get("ru") or (r.name_i18n or {}).get("en") or "—",
            "price_override": str(r.price_override) if r.price_override else None,
        }
        for r in svc_rows
    ]

    return MasterProfileOut(
        id=master.id,
        display_name=master.display_name,
        bio=master.bio or {},
        photo_url=master.photo_url,
        specialization=master.specialization or {},
        rating_avg=float(master.rating_avg) if master.rating_avg else None,
        rating_count=master.rating_count,
        color_hex=master.color_hex,
        working_hours=master.working_hours or {},
        phone=user.phone,
        services=services,
    )


@router.patch("/profile", response_model=MasterProfileOut)
async def patch_master_profile(
    body: MasterProfilePatch,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(_MASTER)],
) -> MasterProfileOut:
    master = await _require_master(user, db)
    data = body.model_dump(exclude_unset=True)

    if "display_name" in data and data["display_name"]:
        master.display_name = data["display_name"].strip()
    if "bio" in data:
        master.bio = data["bio"]
    if "color_hex" in data and data["color_hex"]:
        master.color_hex = data["color_hex"]
    if "working_hours" in data:
        master.working_hours = data["working_hours"]
    if "phone" in data:
        user.phone = data["phone"]

    await db.flush()
    return await master_profile(db=db, user=user)
