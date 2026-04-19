"""Клиенты: CRUD + агрегаты подзапросами."""

from __future__ import annotations

from typing import Any

from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, ForbiddenScopeError, NotFoundError
from app.core.scope import client_scope_filter
from app.models.booking import Booking
from app.models.client import Client
from app.models.enums import BookingStatus, UserRole
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


async def list_clients(
    db: AsyncSession,
    user: User,
    *,
    q: str | None,
    page: int,
    page_size: int,
) -> tuple[list[tuple[Client, int, Decimal]], int]:
    tb, tr = _agg_subqueries()
    filters = [client_scope_filter(user)]
    if q:
        pattern = f"%{q.strip()}%"
        filters.append(
            or_(
                Client.first_name.ilike(pattern),
                Client.last_name.ilike(pattern),
                Client.phone.ilike(pattern),
                Client.tg_username.ilike(pattern),
            )
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
