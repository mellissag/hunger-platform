"""Услуги."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, get_redis, require_roles
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.common import PaginatedResponse
from app.schemas.service import ServiceCreate, ServiceOut, ServiceUpdate
from app.services import catalog_service

router = APIRouter(prefix="/services", tags=["services"])

READ = (UserRole.owner, UserRole.admin, UserRole.reception, UserRole.master)
WRITE = (UserRole.owner, UserRole.admin)


class SetMastersBody(BaseModel):
    master_ids: list[UUID]


@router.get("", response_model=PaginatedResponse[ServiceOut])
async def list_services(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*READ))],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    q: str | None = None,
    category_id: UUID | None = None,
) -> PaginatedResponse[ServiceOut]:
    rows, total = await catalog_service.list_services(
        db, q=q, page=page, page_size=page_size, category_id=category_id
    )
    return PaginatedResponse(
        items=[ServiceOut.model_validate(x) for x in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{service_id}", response_model=ServiceOut)
async def get_service(
    service_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*READ))],
) -> ServiceOut:
    s = await catalog_service.get_service(db, service_id)
    return ServiceOut.model_validate(s)


@router.post("", response_model=ServiceOut)
async def create_service(
    body: ServiceCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*WRITE))],
    redis: Annotated[Redis | None, Depends(get_redis)],
) -> ServiceOut:
    s = await catalog_service.create_service(db, redis, body)
    return ServiceOut.model_validate(s)


@router.patch("/{service_id}", response_model=ServiceOut)
async def update_service(
    service_id: UUID,
    body: ServiceUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*WRITE))],
    redis: Annotated[Redis | None, Depends(get_redis)],
) -> ServiceOut:
    s = await catalog_service.update_service(db, redis, service_id, body)
    return ServiceOut.model_validate(s)


@router.delete("/{service_id}", status_code=204)
async def delete_service(
    service_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*WRITE))],
    redis: Annotated[Redis | None, Depends(get_redis)],
) -> None:
    await catalog_service.delete_service(db, redis, service_id)


@router.get("/{service_id}/masters", response_model=list[UUID])
async def get_service_masters(
    service_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*READ))],
) -> list[UUID]:
    return await catalog_service.get_service_masters(db, service_id)


@router.put("/{service_id}/masters", response_model=list[UUID])
async def set_service_masters(
    service_id: UUID,
    body: SetMastersBody,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*WRITE))],
) -> list[UUID]:
    return await catalog_service.set_service_masters(db, service_id, body.master_ids)
