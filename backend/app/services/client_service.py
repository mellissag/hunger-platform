"""Клиенты: CRUD + агрегаты подзапросами."""

from __future__ import annotations

import csv
import io
from typing import Any

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import UUID

import app.core.clock as clock
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, ForbiddenScopeError, NotFoundError
from app.core.scope import client_scope_filter
from app.models.booking import BlacklistEntry, Booking, Review
from app.models.catalog import Service
from app.models.client import Client
from app.models.enums import BookingStatus, UserRole
from app.models.master import Master
from app.models.user import User
from app.schemas.client import ClientCreate, ClientUpdate


def _agg_subqueries() -> tuple[Any, Any]:
    tb = (
        select(func.count(Booking.id))
        .where(Booking.client_id == Client.id)
        .correlate(Client)
        .scalar_subquery()
    )
    tr = (
        select(func.coalesce(func.sum(Booking.price), 0))
        .where(
            Booking.client_id == Client.id,
            Booking.status == BookingStatus.completed,
        )
        .correlate(Client)
        .scalar_subquery()
    )
    return tb, tr


def _list_client_filters(
    user: User,
    *,
    q: str | None,
    tags: list[str] | None,
    master_id: UUID | None,
    last_visit_days: str | None,
) -> list[Any]:
    filters: list[Any] = [client_scope_filter(user)]
    search = (q or "").strip()
    if search:
        pattern = f"%{search}%"
        filters.append(
            or_(
                Client.first_name.ilike(pattern),
                Client.last_name.ilike(pattern),
                Client.phone.ilike(pattern),
                Client.tg_username.ilike(pattern),
            )
        )
    if tags:
        tag_conds = [Client.tags.contains([t]) for t in tags if t.strip()]
        if tag_conds:
            filters.append(or_(*tag_conds))
    if master_id is not None:
        filters.append(
            Client.id.in_(select(Booking.client_id).where(Booking.master_id == master_id).distinct())
        )
    now = clock.utc_now()
    lv = (last_visit_days or "").strip()
    if lv == "7":
        filters.append(Client.last_visit_at.is_not(None))
        filters.append(Client.last_visit_at >= now - timedelta(days=7))
    elif lv == "30":
        filters.append(Client.last_visit_at.is_not(None))
        filters.append(Client.last_visit_at >= now - timedelta(days=30))
    elif lv == "90":
        filters.append(Client.last_visit_at.is_not(None))
        filters.append(Client.last_visit_at >= now - timedelta(days=90))
    elif lv == "180+":
        filters.append(
            or_(Client.last_visit_at.is_(None), Client.last_visit_at < now - timedelta(days=180))
        )
    return filters


async def list_clients(
    db: AsyncSession,
    user: User,
    *,
    q: str | None,
    page: int,
    page_size: int,
    tags: list[str] | None = None,
    master_id: UUID | None = None,
    last_visit_days: str | None = None,
) -> tuple[list[tuple[Client, int, Decimal]], int]:
    tb, tr = _agg_subqueries()
    filters = _list_client_filters(
        user, q=q, tags=tags, master_id=master_id, last_visit_days=last_visit_days
    )
    count_stmt = select(func.count(Client.id)).where(*filters)
    total = int((await db.execute(count_stmt)).scalar_one())

    stmt = (
        select(Client, tb.label("total_bookings"), tr.label("total_revenue"))
        .where(*filters)
        .order_by(Client.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await db.execute(stmt)).all()
    out: list[tuple[Client, int, Decimal]] = []
    for row in rows:
        c = row[0]
        out.append((c, int(row.total_bookings or 0), Decimal(row.total_revenue or 0)))
    return out, total


async def client_stats(db: AsyncSession, user: User) -> tuple[int, int, float]:
    scope = client_scope_filter(user)
    total = int((await db.execute(select(func.count(Client.id)).where(scope))).scalar_one() or 0)
    now = clock.utc_now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    new_month = int(
        (
            await db.execute(
                select(func.count(Client.id)).where(scope).where(Client.joined_at >= month_start)
            )
        ).scalar_one()
        or 0
    )
    sub = (
        select(Booking.client_id, func.coalesce(func.sum(Booking.price), 0).label("rev"))
        .where(Booking.status == BookingStatus.completed)
        .group_by(Booking.client_id)
    ).subquery()
    avg_ltv = (
        await db.execute(
            select(func.coalesce(func.avg(sub.c.rev), 0))
            .select_from(sub)
            .join(Client, Client.id == sub.c.client_id)
            .where(scope)
        )
    ).scalar_one()
    return total, new_month, float(avg_ltv or 0)


def _service_name(svc: Service) -> str:
    d = dict(svc.name_i18n or {})
    if not d:
        return ""
    return str(d.get("en") or next(iter(d.values())))


async def get_client_detail(
    db: AsyncSession,
    user: User,
    client_id: UUID,
) -> tuple[Client, int, Decimal, list, list, list, BlacklistEntry | None]:
    """Заметки, история броней, отзывы, блэклист."""
    from app.services import client_note_service

    c, tb, tr = await get_client(db, user, client_id)
    notes = await client_note_service.list_notes(db, user, client_id)

    b_stmt = (
        select(Booking, Service, Master)
        .join(Service, Service.id == Booking.service_id)
        .join(Master, Master.id == Booking.master_id)
        .where(Booking.client_id == client_id)
        .order_by(Booking.starts_at.desc())
        .limit(11)
    )
    if user.role == UserRole.master and user.master_id is not None:
        b_stmt = b_stmt.where(Booking.master_id == user.master_id)
    brows = (await db.execute(b_stmt)).all()
    bookings_out: list[tuple[Booking, str, str]] = []
    for b, svc, m in brows:
        bookings_out.append((b, _service_name(svc), m.display_name))

    r_stmt = (
        select(Review, Master)
        .join(Master, Master.id == Review.master_id)
        .where(Review.client_id == client_id)
        .order_by(Review.created_at.desc())
    )
    rrows = (await db.execute(r_stmt)).all()
    reviews_out: list[tuple[Review, str]] = [(r, m.display_name) for r, m in rrows]

    be = (
        await db.execute(select(BlacklistEntry).where(BlacklistEntry.client_id == client_id).limit(1))
    ).scalar_one_or_none()

    return c, tb, tr, notes, bookings_out, reviews_out, be


async def export_clients_csv_bytes(
    db: AsyncSession,
    user: User,
    *,
    q: str | None,
    tags: list[str] | None,
    master_id: UUID | None,
    last_visit_days: str | None,
) -> bytes:
    tb, tr = _agg_subqueries()
    filters = _list_client_filters(
        user, q=q, tags=tags, master_id=master_id, last_visit_days=last_visit_days
    )
    stmt = (
        select(Client, tb.label("total_bookings"), tr.label("total_revenue"))
        .where(*filters)
        .order_by(Client.created_at.desc())
        .limit(10_000)
    )
    rows = (await db.execute(stmt)).all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(
        [
            "id",
            "first_name",
            "last_name",
            "phone",
            "tg_username",
            "tags",
            "total_bookings",
            "total_revenue",
            "last_visit_at",
            "joined_at",
        ]
    )
    for row in rows:
        cl = row[0]
        w.writerow(
            [
                str(cl.id),
                cl.first_name or "",
                cl.last_name or "",
                cl.phone or "",
                cl.tg_username or "",
                ",".join(cl.tags or []),
                int(row.total_bookings or 0),
                str(row.total_revenue or 0),
                cl.last_visit_at.isoformat() if cl.last_visit_at else "",
                cl.joined_at.isoformat(),
            ]
        )
    return buf.getvalue().encode("utf-8-sig")


async def get_client(
    db: AsyncSession, user: User, client_id: UUID
) -> tuple[Client, int, Decimal]:
    tb, tr = _agg_subqueries()
    stmt = (
        select(Client, tb.label("total_bookings"), tr.label("total_revenue"))
        .where(Client.id == client_id)
        .where(client_scope_filter(user))
    )
    row = (await db.execute(stmt)).one_or_none()
    if row is None:
        raise NotFoundError("Client not found")
    return (
        row[0],
        int(row.total_bookings or 0),
        Decimal(row.total_revenue or 0),
    )


async def create_client(db: AsyncSession, user: User, data: ClientCreate) -> Client:
    if user.role == UserRole.master:
        raise ForbiddenScopeError("Masters cannot create clients via API")
    c = Client(
        tg_user_id=data.tg_user_id,
        tg_username=data.tg_username,
        phone=data.phone,
        first_name=data.first_name,
        last_name=data.last_name,
        birthday=data.birthday,
        lang=data.lang,
        source=data.source,
        tags=data.tags,
    )
    db.add(c)
    try:
        await db.flush()
    except IntegrityError as e:
        raise ConflictError("Client already exists or invalid data", code="client_duplicate") from e
    await db.refresh(c)
    return c


async def update_client(db: AsyncSession, user: User, client_id: UUID, data: ClientUpdate) -> Client:
    row = await db.get(Client, client_id)
    if row is None:
        raise NotFoundError("Client not found")
    if user.role == UserRole.master:
        if user.master_id is None:
            raise ForbiddenScopeError()
        from sqlalchemy import and_, exists

        ok = await db.scalar(
            select(
                exists(
                    select(1)
                    .select_from(Booking)
                    .where(
                        and_(
                            Booking.client_id == client_id,
                            Booking.master_id == user.master_id,
                        )
                    )
                )
            )
        )
        if not ok:
            raise ForbiddenScopeError()
    payload = data.model_dump(exclude_unset=True)
    for k, v in payload.items():
        setattr(row, k, v)
    row.updated_at = datetime.now(tz=UTC)
    await db.flush()
    return row


async def delete_client(db: AsyncSession, user: User, client_id: UUID) -> None:
    if user.role == UserRole.master:
        raise ForbiddenScopeError("Masters cannot delete clients")
    row = await db.get(Client, client_id)
    if row is None:
        raise NotFoundError("Client not found")
    try:
        await db.delete(row)
        await db.flush()
    except IntegrityError as e:
        raise ConflictError("Client has related records", code="client_has_bookings") from e
