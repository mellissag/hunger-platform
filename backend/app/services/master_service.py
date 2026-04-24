"""Мастера: CRUD."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import delete, exists, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictError, ForbiddenScopeError, NotFoundError
from app.core.scope import ensure_master_own_master_id, master_record_scope_filter
from app.core.security import hash_password
from app.models.catalog import MasterService, Service
from app.models.enums import UserRole
from app.models.master import Master
from app.models.user import User
from app.schemas.master import MasterCreate, MasterOut, MasterUpdate


def master_to_out(m: Master, *, locale: str = "ru") -> MasterOut:
    return MasterOut.from_orm_with_services(m, locale=locale)


async def list_masters(
    db: AsyncSession,
    user: User,
    *,
    q: str | None,
    page: int,
    page_size: int,
    service_id: UUID | None = None,
) -> tuple[list[Master], int]:
    stmt = (
        select(Master)
        .options(
            selectinload(Master.master_services).selectinload(MasterService.service),
            selectinload(Master.users),
        )
        .where(master_record_scope_filter(user))
    )
    if service_id is not None:
        stmt = stmt.where(
            exists(
                select(1)
                .select_from(MasterService)
                .where(MasterService.master_id == Master.id, MasterService.service_id == service_id)
            )
        )
    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(Master.display_name.ilike(pattern))
    count_stmt = select(func.count(Master.id.distinct())).select_from(Master).where(
        master_record_scope_filter(user)
    )
    if service_id is not None:
        count_stmt = count_stmt.where(
            exists(
                select(1)
                .select_from(MasterService)
                .where(MasterService.master_id == Master.id, MasterService.service_id == service_id)
            )
        )
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
    stmt = (
        select(Master)
        .options(
            selectinload(Master.master_services).selectinload(MasterService.service),
            selectinload(Master.users),
        )
        .where(Master.id == master_id)
        .where(master_record_scope_filter(user))
    )
    m = (await db.execute(stmt)).scalar_one_or_none()
    if m is None:
        raise NotFoundError("Master not found")
    return m


async def create_master(db: AsyncSession, _user: User, data: MasterCreate) -> Master:
    email = data.email.strip().lower()
    exists = (await db.execute(select(User.id).where(User.email == email))).scalar_one_or_none()
    if exists is not None:
        raise ConflictError("Email already registered", code="email_taken")

    m = Master(
        display_name=data.display_name,
        bio=data.bio,
        specialization=data.specialization,
        photo_url=data.photo_url,
        color_hex=data.color_hex,
        sort_order=data.sort_order,
        is_active=data.is_active,
        payroll_percent=data.payroll_percent,
        tg_user_id=data.tg_user_id,
        certificates=[c.model_dump() for c in data.certificates],
    )
    db.add(m)
    await db.flush()

    u = User(
        email=email,
        password_hash=hash_password(data.password),
        role=UserRole.master,
        first_name=data.display_name,
        last_name=None,
        master_id=m.id,
        is_active=True,
    )
    db.add(u)
    await db.flush()

    for sid in data.service_ids:
        db.add(MasterService(master_id=m.id, service_id=sid))
    await db.flush()

    await db.refresh(m)
    stmt = (
        select(Master)
        .options(
            selectinload(Master.master_services).selectinload(MasterService.service),
            selectinload(Master.users),
        )
        .where(Master.id == m.id)
    )
    loaded = (await db.execute(stmt)).scalar_one()
    return loaded


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
    stmt = (
        select(Master)
        .options(
            selectinload(Master.master_services).selectinload(MasterService.service),
            selectinload(Master.users),
        )
        .where(Master.id == m.id)
    )
    return (await db.execute(stmt)).scalar_one()


async def delete_master(db: AsyncSession, user: User, master_id: UUID) -> None:
    if user.role != UserRole.owner:
        raise ForbiddenScopeError("Only owner can delete masters")
    m = await db.get(Master, master_id)
    if m is None:
        raise NotFoundError("Master not found")
    try:
        await db.execute(delete(User).where(User.master_id == master_id))
        await db.delete(m)
        await db.flush()
    except IntegrityError as e:
        raise ConflictError("Master has related records", code="master_in_use") from e
