"""Чёрный список (admin + мастер/ресепшн по page_permissions)."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.core.user_page_permissions import page_perm
from app.deps import get_current_user, get_db
from app.models.booking import BlacklistEntry
from app.models.client import Client
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.blacklist_admin import BlacklistCreate, BlacklistEntryOut, BlacklistPatch
from app.schemas.common import PaginatedResponse

router = APIRouter(prefix="/blacklist", tags=["blacklist"])


def _is_privileged(user: User) -> bool:
    return user.role in (UserRole.owner, UserRole.admin)


async def require_blacklist_read(user: Annotated[User, Depends(get_current_user)]) -> User:
    if _is_privileged(user):
        return user
    if user.role in (UserRole.master, UserRole.reception) and page_perm(user, "blacklist", "enabled"):
        return user
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")


async def require_blacklist_add(user: Annotated[User, Depends(get_current_user)]) -> User:
    if _is_privileged(user):
        return user
    if user.role in (UserRole.master, UserRole.reception) and page_perm(user, "blacklist", "add"):
        return user
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")


async def require_blacklist_patch(user: Annotated[User, Depends(get_current_user)]) -> User:
    if _is_privileged(user):
        return user
    if user.role in (UserRole.master, UserRole.reception):
        if page_perm(user, "blacklist", "enabled") and not page_perm(user, "blacklist", "view_only"):
            return user
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")


async def require_blacklist_remove(user: Annotated[User, Depends(get_current_user)]) -> User:
    if _is_privileged(user):
        return user
    if user.role in (UserRole.master, UserRole.reception) and page_perm(user, "blacklist", "remove"):
        return user
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")


def _name(c: Client) -> str | None:
    parts = [c.first_name or "", c.last_name or ""]
    s = " ".join(p for p in parts if p).strip()
    return s or None


@router.get("", response_model=PaginatedResponse[BlacklistEntryOut])
async def list_blacklist(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_blacklist_read)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
) -> PaginatedResponse[BlacklistEntryOut]:
    count_stmt = select(func.count()).select_from(BlacklistEntry)
    total = (await db.execute(count_stmt)).scalar_one()
    offset = (page - 1) * page_size
    stmt = (
        select(BlacklistEntry, Client)
        .join(Client, Client.id == BlacklistEntry.client_id)
        .order_by(BlacklistEntry.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    rows = (await db.execute(stmt)).all()
    items: list[BlacklistEntryOut] = []
    for be, cl in rows:
        items.append(
            BlacklistEntryOut(
                id=be.id,
                client_id=be.client_id,
                client_name=_name(cl),
                phone=cl.phone,
                tg_username=cl.tg_username,
                reason=be.reason,
                created_at=be.created_at,
                expires_at=be.expires_at,
            )
        )
    return PaginatedResponse(items=items, total=int(total or 0), page=page, page_size=page_size)


@router.post("", response_model=BlacklistEntryOut)
async def add_blacklist(
    body: BlacklistCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_blacklist_add)],
) -> BlacklistEntryOut:
    cl = await db.get(Client, body.client_id)
    if cl is None:
        raise NotFoundError("Client not found")
    existing = await db.execute(select(BlacklistEntry.id).where(BlacklistEntry.client_id == body.client_id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Client already blacklisted")
    be = BlacklistEntry(
        client_id=body.client_id,
        reason=body.reason,
        expires_at=body.expires_at,
        added_by_user_id=user.id,
    )
    db.add(be)
    await db.flush()
    return BlacklistEntryOut(
        id=be.id,
        client_id=be.client_id,
        client_name=_name(cl),
        phone=cl.phone,
        tg_username=cl.tg_username,
        reason=be.reason,
        created_at=be.created_at,
        expires_at=be.expires_at,
    )


@router.patch("/{entry_id}", response_model=BlacklistEntryOut)
async def patch_blacklist(
    entry_id: UUID,
    body: BlacklistPatch,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_blacklist_patch)],
) -> BlacklistEntryOut:
    be = await db.get(BlacklistEntry, entry_id)
    if be is None:
        raise NotFoundError("Entry not found")
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(be, k, v)
    cl = await db.get(Client, be.client_id)
    assert cl is not None
    return BlacklistEntryOut(
        id=be.id,
        client_id=be.client_id,
        client_name=_name(cl),
        phone=cl.phone,
        tg_username=cl.tg_username,
        reason=be.reason,
        created_at=be.created_at,
        expires_at=be.expires_at,
    )


@router.delete("/{entry_id}", status_code=204)
async def delete_blacklist(
    entry_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_blacklist_remove)],
) -> None:
    be = await db.get(BlacklistEntry, entry_id)
    if be is None:
        raise NotFoundError("Entry not found")
    await db.delete(be)
