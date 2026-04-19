"""Мастера: CRUD."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, ForbiddenScopeError, NotFoundError
from app.core.scope import ensure_master_own_master_id, master_record_scope_filter
from app.models.enums import UserRole
from app.models.master import Master
from app.models.user import User
from app.schemas.master import MasterCreate, MasterUpdate


async def list_masters(
    db: AsyncSession,
    user: User,
    *,
    q: str | None,
    page: int,
    page_size: int,
) -> tuple[list[Master], int]:
    stmt = select(Master).where(master_record_scope_filter(user))
    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(Master.display_name.ilike(pattern))
    count_stmt = select(func.count(Master.id)).where(master_record_scope_filter(user))
    if q:
        pattern = f"%{q.strip()}%"
        count_stmt = count_stmt.where(Master.display_name.ilike(pattern))
    total = int((await db.execute(count_stmt)).scalar_one())
    stmt = (
        stmt.order_by(Master.sort_order.asc(), Master.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows), total


async def get_master(db: AsyncSession, user: User, master_id: UUID) -> Master:
    stmt = select(Master).where(Master.id == master_id).where(master_record_scope_filter(user))
    m = (await db.execute(stmt)).scalar_one_or_none()
    if m is None:
        raise NotFoundError("Master not found")
    return m


async def create_master(db: AsyncSession, _user: User, data: MasterCreate) -> Master:
    m = Master(
        display_name=data.display_name,
        bio=data.bio,
        specialization=data.specialization,
        photo_url=data.photo_url,
        color_hex=data.color_hex,
        sort_order=data.sort_order,
        is_active=data.is_active,
    )
    db.add(m)
    await db.flush()
    await db.refresh(m)
    return m


async def update_master(db: AsyncSession, user: User, master_id: UUID, data: MasterUpdate) -> Master:
    m = await db.get(Master, master_id)
    if m is None:
        raise NotFoundError("Master not found")
    if user.role == UserRole.master:
        ensure_master_own_master_id(user, master_id)
    elif user.role not in (UserRole.owner, UserRole.admin):
        raise ForbiddenScopeError()
    payload = data.model_dump(exclude_unset=True)
    for k, v in payload.items():
        setattr(m, k, v)
    m.updated_at = datetime.now(tz=UTC)
    await db.flush()
    return m


async def delete_master(db: AsyncSession, user: User, master_id: UUID) -> None:
    if user.role not in (UserRole.owner, UserRole.admin):
        raise ForbiddenScopeError("Only owner/admin can delete masters")
    m = await db.get(Master, master_id)
    if m is None:
        raise NotFoundError("Master not found")
    try:
        await db.delete(m)
        await db.flush()
    except IntegrityError as e:
        raise ConflictError("Master has related records", code="master_in_use") from e
