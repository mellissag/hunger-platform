"""CRUD мастеров."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, require_roles
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.common import PaginatedResponse
from app.schemas.master import MasterCreate, MasterOut, MasterUpdate
from app.services import master_service

router = APIRouter(prefix="/masters", tags=["masters"])

READ_STAFF = (UserRole.owner, UserRole.admin, UserRole.reception, UserRole.master)
WRITE_STAFF = (UserRole.owner, UserRole.admin)


@router.get("", response_model=PaginatedResponse[MasterOut])
async def list_masters(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*READ_STAFF))],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    q: str | None = None,
) -> PaginatedResponse[MasterOut]:
    rows, total = await master_service.list_masters(db, user, q=q, page=page, page_size=page_size)
    return PaginatedResponse(
        items=[MasterOut.model_validate(m) for m in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{master_id}", response_model=MasterOut)
async def get_master(
    master_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*READ_STAFF))],
) -> MasterOut:
    m = await master_service.get_master(db, user, master_id)
    return MasterOut.model_validate(m)


@router.post("", response_model=MasterOut)
async def create_master(
    body: MasterCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*WRITE_STAFF))],
) -> MasterOut:
    m = await master_service.create_master(db, user, body)
    return MasterOut.model_validate(m)


@router.patch("/{master_id}", response_model=MasterOut)
async def update_master(
    master_id: UUID,
    body: MasterUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.owner, UserRole.admin, UserRole.master))],
) -> MasterOut:
    m = await master_service.update_master(db, user, master_id, body)
    return MasterOut.model_validate(m)


@router.delete("/{master_id}", status_code=204)
async def delete_master(
    master_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*WRITE_STAFF))],
) -> None:
    await master_service.delete_master(db, user, master_id)
