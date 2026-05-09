"""Категории и услуги + Redis-уведомления."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from uuid import UUID

from loguru import logger
from redis.asyncio import Redis
from sqlalchemy import String, cast as sa_cast, delete, exists, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictError, NotFoundError
from app.models.catalog import Service, ServiceCategory, ServiceCategoryLink
from app.schemas.service import (
    ServiceCategoryBriefOut,
    ServiceCategoryCreate,
    ServiceCategoryUpdate,
    ServiceCreate,
    ServiceOut,
    ServiceUpdate,
)

CHANNEL = "services:updates"
CACHE_KEY = "services:list:active"


async def _publish(redis: Redis | None, action: str, service_id: UUID | None) -> None:
    if redis is None:
        return
    try:
        payload = json.dumps({"action": action, "id": str(service_id) if service_id else None})
        await redis.publish(CHANNEL, payload)
        await redis.delete(CACHE_KEY)
    except Exception as e:
        logger.warning("redis_publish_failed: {}", e)


async def _refresh_service_primary_category(db: AsyncSession, service_id: UUID) -> None:
    """Устаревший category_id = первая связанная категория по sort_order."""
    stmt = (
        select(ServiceCategory.id)
        .join(ServiceCategoryLink, ServiceCategoryLink.category_id == ServiceCategory.id)
        .where(ServiceCategoryLink.service_id == service_id)
        .order_by(ServiceCategory.sort_order.asc(), ServiceCategory.created_at.asc())
    )
    row = (await db.execute(stmt)).scalars().first()
    s = await db.get(Service, service_id)
    if s:
        s.category_id = row


async def sync_service_categories(
    db: AsyncSession, service_id: UUID, category_ids: list[UUID]
) -> None:
    await db.execute(delete(ServiceCategoryLink).where(ServiceCategoryLink.service_id == service_id))
    for cid in category_ids:
        db.add(ServiceCategoryLink(service_id=service_id, category_id=cid))
    s = await db.get(Service, service_id)
    if s:
        s.category_id = category_ids[0] if category_ids else None
    await db.flush()


async def sync_category_services(
    db: AsyncSession, category_id: UUID, service_ids: list[UUID]
) -> None:
    prev_stmt = select(ServiceCategoryLink.service_id).where(
        ServiceCategoryLink.category_id == category_id
    )
    prev = set((await db.execute(prev_stmt)).scalars().all())
    await db.execute(delete(ServiceCategoryLink).where(ServiceCategoryLink.category_id == category_id))
    for sid in service_ids:
        db.add(ServiceCategoryLink(service_id=sid, category_id=category_id))
    for sid in prev | set(service_ids):
        await _refresh_service_primary_category(db, sid)
    await db.flush()


async def list_category_service_ids(db: AsyncSession, category_id: UUID) -> list[UUID]:
    stmt = select(ServiceCategoryLink.service_id).where(ServiceCategoryLink.category_id == category_id)
    return list((await db.execute(stmt)).scalars().all())


def service_to_out(
    s: Service,
    *,
    masters_count: int | None = None,
    bookings_30d: int | None = None,
) -> ServiceOut:
    cats_sorted = sorted((s.categories or []), key=lambda c: (c.sort_order, str(c.id)))
    brief = [ServiceCategoryBriefOut.model_validate(c) for c in cats_sorted]
    base = ServiceOut.model_validate(s)
    return base.model_copy(
        update={
            "categories": brief,
            "masters_count": masters_count if masters_count is not None else base.masters_count,
            "bookings_30d": bookings_30d if bookings_30d is not None else base.bookings_30d,
        }
    )


async def list_categories(
    db: AsyncSession, *, q: str | None, page: int, page_size: int
) -> tuple[list[ServiceCategory], int]:
    filters = []
    if q:
        pattern = f"%{q.strip()}%"
        filters.append(sa_cast(ServiceCategory.name_i18n, String).ilike(pattern))
    count_stmt = select(func.count(ServiceCategory.id))
    if filters:
        count_stmt = count_stmt.where(*filters)
    total = int((await db.execute(count_stmt)).scalar_one())
    stmt = select(ServiceCategory)
    if filters:
        stmt = stmt.where(*filters)
    stmt = (
        stmt.order_by(ServiceCategory.sort_order.asc(), ServiceCategory.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows), total


async def get_category(db: AsyncSession, category_id: UUID) -> ServiceCategory:
    c = await db.get(ServiceCategory, category_id)
    if c is None:
        raise NotFoundError("Category not found")
    return c


async def create_category(db: AsyncSession, data: ServiceCategoryCreate) -> ServiceCategory:
    c = ServiceCategory(
        name_i18n=data.name_i18n,
        icon=data.icon,
        sort_order=data.sort_order,
    )
    db.add(c)
    await db.flush()
    await db.refresh(c)
    return c


async def update_category(
    db: AsyncSession, redis: Redis | None, category_id: UUID, data: ServiceCategoryUpdate
) -> ServiceCategory:
    c = await db.get(ServiceCategory, category_id)
    if c is None:
        raise NotFoundError("Category not found")
    payload = data.model_dump(exclude_unset=True)
    payload.pop("service_ids", None)
    for k, v in payload.items():
        setattr(c, k, v)
    if "service_ids" in data.model_fields_set:
        await sync_category_services(db, category_id, list(data.service_ids or []))
    await db.flush()
    await _publish(redis, "category_update", None)
    return c


async def delete_category(db: AsyncSession, redis: Redis | None, category_id: UUID) -> None:
    c = await db.get(ServiceCategory, category_id)
    if c is None:
        raise NotFoundError("Category not found")
    try:
        await db.delete(c)
        await db.flush()
    except IntegrityError as e:
        raise ConflictError("Category has services", code="category_in_use") from e
    await _publish(redis, "category_delete", None)


async def list_services(
    db: AsyncSession,
    *,
    q: str | None,
    page: int,
    page_size: int,
    category_id: UUID | None = None,
) -> tuple[list[Service], int]:
    filters = []
    if q:
        pattern = f"%{q.strip()}%"
        filters.append(
            or_(
                sa_cast(Service.name_i18n, String).ilike(pattern),
                sa_cast(Service.description_i18n, String).ilike(pattern),
            )
        )
    if category_id is not None:
        link_exists = exists().where(
            ServiceCategoryLink.service_id == Service.id,
            ServiceCategoryLink.category_id == category_id,
        )
        filters.append(or_(Service.category_id == category_id, link_exists))
    count_stmt = select(func.count(Service.id))
    if filters:
        count_stmt = count_stmt.where(*filters)
    total = int((await db.execute(count_stmt)).scalar_one())
    stmt = select(Service).options(selectinload(Service.categories))
    if filters:
        stmt = stmt.where(*filters)
    stmt = (
        stmt.order_by(Service.sort_order.asc(), Service.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows), total


async def get_service_aggregates(
    db: AsyncSession, service_ids: list[UUID]
) -> tuple[dict[UUID, int], dict[UUID, int]]:
    """Счётчики мастеров и броней за 30 дней по списку услуг."""
    if not service_ids:
        return {}, {}

    from app.models.booking import Booking
    from app.models.catalog import MasterService
    from app.models.enums import BookingStatus

    m_stmt = (
        select(MasterService.service_id, func.count().label("cnt"))
        .where(MasterService.service_id.in_(service_ids))
        .group_by(MasterService.service_id)
    )
    m_rows = (await db.execute(m_stmt)).all()
    masters_map: dict[UUID, int] = {row[0]: int(row[1]) for row in m_rows}

    now = datetime.now(tz=UTC)
    thirty_ago = now - timedelta(days=30)
    cancelled = (BookingStatus.cancelled_by_client, BookingStatus.cancelled_by_salon)
    time_ref = func.coalesce(Booking.starts_at, Booking.created_at)
    b_stmt = (
        select(Booking.service_id, func.count().label("cnt"))
        .where(
            Booking.service_id.in_(service_ids),
            time_ref >= thirty_ago,
            Booking.status.notin_(cancelled),
        )
        .group_by(Booking.service_id)
    )
    b_rows = (await db.execute(b_stmt)).all()
    book_map: dict[UUID, int] = {row[0]: int(row[1]) for row in b_rows}
    return masters_map, book_map


async def get_service_stats(db: AsyncSession) -> tuple[int, int, int, float]:
    """total, active, bookings in current calendar month, average catalog price (€)."""
    from app.models.booking import Booking
    from app.models.enums import BookingStatus

    total = int((await db.execute(select(func.count(Service.id)))).scalar_one())
    active = int(
        (await db.execute(select(func.count(Service.id)).where(Service.is_active.is_(True)))).scalar_one()
    )

    now = datetime.now(tz=UTC)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    cancelled = (BookingStatus.cancelled_by_client, BookingStatus.cancelled_by_salon)
    time_ref = func.coalesce(Booking.starts_at, Booking.created_at)
    bookings_month = int(
        (
            await db.execute(
                select(func.count(Booking.id)).where(
                    time_ref >= month_start,
                    Booking.status.notin_(cancelled),
                )
            )
        ).scalar_one()
    )

    avg_row = (await db.execute(select(func.coalesce(func.avg(Service.price), 0)))).scalar_one()
    avg_revenue = float(avg_row) if avg_row is not None else 0.0
    return total, active, bookings_month, avg_revenue


async def get_service_masters(db: AsyncSession, service_id: UUID) -> list[UUID]:
    """Return list of master_ids linked to a service."""
    from app.models.catalog import MasterService

    stmt = select(MasterService.master_id).where(MasterService.service_id == service_id)
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows)


async def set_service_masters(
    db: AsyncSession, service_id: UUID, master_ids: list[UUID]
) -> list[UUID]:
    """Replace all master links for a service."""
    from app.models.catalog import MasterService
    from sqlalchemy import delete

    await db.execute(delete(MasterService).where(MasterService.service_id == service_id))
    for mid in master_ids:
        db.add(MasterService(master_id=mid, service_id=service_id))
    await db.flush()
    return master_ids


async def get_service(db: AsyncSession, service_id: UUID) -> Service:
    stmt = select(Service).where(Service.id == service_id).options(selectinload(Service.categories))
    s = (await db.execute(stmt)).scalar_one_or_none()
    if s is None:
        raise NotFoundError("Service not found")
    return s


async def create_service(db: AsyncSession, redis: Redis | None, data: ServiceCreate) -> Service:
    s = Service(
        category_id=data.category_id,
        name_i18n=data.name_i18n,
        description_i18n=data.description_i18n,
        duration_minutes=data.duration_minutes,
        duration_type=data.duration_type,
        duration_max_minutes=data.duration_max_minutes,
        price=data.price,
        photo_url=data.photo_url,
        is_active=data.is_active,
        sort_order=data.sort_order,
    )
    db.add(s)
    await db.flush()
    if data.category_ids is not None:
        cat_ids = list(data.category_ids)
    elif data.category_id is not None:
        cat_ids = [data.category_id]
    else:
        cat_ids = []
    await sync_service_categories(db, s.id, cat_ids)
    stmt = select(Service).where(Service.id == s.id).options(selectinload(Service.categories))
    s = (await db.execute(stmt)).scalar_one()
    await _publish(redis, "create", s.id)
    return s


async def update_service(
    db: AsyncSession, redis: Redis | None, service_id: UUID, data: ServiceUpdate
) -> Service:
    s = await db.get(Service, service_id)
    if s is None:
        raise NotFoundError("Service not found")
    payload = data.model_dump(exclude_unset=True)
    payload.pop("category_ids", None)
    payload.pop("category_id", None)
    for k, v in payload.items():
        setattr(s, k, v)
    s.updated_at = datetime.now(tz=UTC)
    if "category_ids" in data.model_fields_set:
        await sync_service_categories(db, service_id, list(data.category_ids or []))
    elif "category_id" in data.model_fields_set:
        cid = data.category_id
        await sync_service_categories(db, service_id, [cid] if cid else [])
    else:
        await db.flush()
    stmt = select(Service).where(Service.id == service_id).options(selectinload(Service.categories))
    s = (await db.execute(stmt)).scalar_one()
    await _publish(redis, "update", s.id)
    return s


async def delete_service(db: AsyncSession, redis: Redis | None, service_id: UUID) -> None:
    s = await db.get(Service, service_id)
    if s is None:
        raise NotFoundError("Service not found")
    try:
        await db.delete(s)
        await db.flush()
    except IntegrityError as e:
        raise ConflictError("Service is in use", code="service_in_use") from e
    await _publish(redis, "delete", service_id)
