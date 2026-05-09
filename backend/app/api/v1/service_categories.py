"""Категории услуг."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, get_redis, require_roles
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.common import PaginatedResponse
from app.schemas.service import ServiceCategoryCreate, ServiceCategoryOut, ServiceCategoryUpdate
from app.services import catalog_service

router = APIRouter(prefix="/service-categories", tags=["service-categories"])

READ = (UserRole.owner, UserRole.admin, UserRole.reception, UserRole.master)
WRITE = (UserRole.owner, UserRole.admin)


@router.get("", response_model=PaginatedResponse[ServiceCategoryOut])
async def list_categories(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*READ))],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    q: str | None = None,
) -> PaginatedResponse[ServiceCategoryOut]:
    rows, total = await catalog_service.list_categories(db, q=q, page=page, page_size=page_size)
    return PaginatedResponse(
        items=[ServiceCategoryOut.model_validate(x) for x in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{category_id}", response_model=ServiceCategoryOut)
async def get_category(
    category_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*READ))],
) -> ServiceCategoryOut:
    c = await catalog_service.get_category(db, category_id)
    sids = await catalog_service.list_category_service_ids(db, category_id)
    return ServiceCategoryOut.model_validate(c).model_copy(update={"service_ids": sids})


@router.post("", response_model=ServiceCategoryOut)
async def create_category(
    body: ServiceCategoryCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*WRITE))],
    redis: Annotated[Redis | None, Depends(get_redis)],
) -> ServiceCategoryOut:
    c = await catalog_service.create_category(db, body)
    return ServiceCategoryOut.model_validate(c)


@router.patch("/{category_id}", response_model=ServiceCategoryOut)
async def update_category(
    category_id: UUID,
    body: ServiceCategoryUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*WRITE))],
    redis: Annotated[Redis | None, Depends(get_redis)],
) -> ServiceCategoryOut:
    c = await catalog_service.update_category(db, redis, category_id, body)
    return ServiceCategoryOut.model_validate(c)


@router.delete("/{category_id}", status_code=204)
async def delete_category(
    category_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*WRITE))],
    redis: Annotated[Redis | None, Depends(get_redis)],
) -> None:
    await catalog_service.delete_category(db, redis, category_id)
