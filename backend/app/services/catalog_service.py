"""Категории и услуги + Redis-уведомления."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from uuid import UUID

from loguru import logger
from redis.asyncio import Redis
from sqlalchemy import String, cast as sa_cast, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.models.catalog import Service, ServiceCategory
from app.schemas.service import (
    ServiceCategoryCreate,
    ServiceCategoryUpdate,
    ServiceCreate,
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
    for k, v in payload.items():
        setattr(c, k, v)
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
    db: AsyncSession, *, q: str | None, page: int, page_size: int
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
    count_stmt = select(func.count(Service.id))
    if filters:
        count_stmt = count_stmt.where(*filters)
    total = int((await db.execute(count_stmt)).scalar_one())
    stmt = select(Service)
    if filters:
        stmt = stmt.where(*filters)
    stmt = (
        stmt.order_by(Service.sort_order.asc(), Service.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows), total


async def get_service(db: AsyncSession, service_id: UUID) -> Service:
    s = await db.get(Service, service_id)
    if s is None:
        raise NotFoundError("Service not found")
    return s


async def create_service(db: AsyncSession, redis: Redis | None, data: ServiceCreate) -> Service:
    s = Service(
        category_id=data.category_id,
        name_i18n=data.name_i18n,
        description_i18n=data.description_i18n,
        duration_minutes=data.duration_minutes,
        price=data.price,
        photo_url=data.photo_url,
        is_active=data.is_active,
        sort_order=data.sort_order,
    )
    db.add(s)
    await db.flush()
    await db.refresh(s)
    await _publish(redis, "create", s.id)
    return s


async def update_service(
    db: AsyncSession, redis: Redis | None, service_id: UUID, data: ServiceUpdate
) -> Service:
    s = await db.get(Service, service_id)
    if s is None:
        raise NotFoundError("Service not found")
    payload = data.model_dump(exclude_unset=True)
    for k, v in payload.items():
        setattr(s, k, v)
    s.updated_at = datetime.now(tz=UTC)
    await db.flush()
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
