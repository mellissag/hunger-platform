"""Сотрудники: CRUD и инвайты (owner)."""

from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.core.security import hash_password
from app.deps import get_db, require_roles
from app.models.enums import UserRole
from app.models.user import User
from app.models.user_invite import UserInvite
from app.schemas.common import PaginatedResponse
from app.schemas.users_admin import (
    InviteCreate,
    InviteCreatedResponse,
    UserStaffCreate,
    UserStaffOut,
    UserStaffPatch,
)
from app.services.audit_log import record_event, record_role_change

router = APIRouter(prefix="/users", tags=["users"])

_OWNER = (UserRole.owner,)


def _hash_invite(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


@router.get("", response_model=PaginatedResponse[UserStaffOut])
async def list_users(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*_OWNER))],
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
) -> PaginatedResponse[UserStaffOut]:
    total = (await db.execute(select(func.count()).select_from(User))).scalar_one()
    offset = (page - 1) * page_size
    res = await db.execute(
        select(User).order_by(User.created_at.desc()).offset(offset).limit(page_size)
    )
    rows = list(res.scalars().all())
    items = [UserStaffOut.model_validate(u) for u in rows]
    return PaginatedResponse(items=items, total=int(total or 0), page=page, page_size=page_size)


@router.post("", response_model=UserStaffOut)
async def create_user(
    body: UserStaffCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(*_OWNER))],
) -> UserStaffOut:
    if body.role == UserRole.owner:
        raise HTTPException(status_code=400, detail="Cannot create another owner via API")
    email_norm = body.email.lower()
    exists = (await db.execute(select(User.id).where(User.email == email_norm))).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=409, detail="Email already registered")
    u = User(
        email=email_norm,
        password_hash=hash_password(body.password),
        role=body.role,
        first_name=body.first_name,
        last_name=body.last_name,
        lang=body.lang,
        master_id=body.master_id,
        is_active=True,
    )
    db.add(u)
    await db.flush()
    await record_event(
        db,
        user_id=actor.id,
        action="user.created",
        entity_type="user",
        entity_id=u.id,
        payload={"email": email_norm, "role": body.role.value},
    )
    return UserStaffOut.model_validate(u)


@router.patch("/{user_id}", response_model=UserStaffOut)
async def patch_user(
    user_id: UUID,
    body: UserStaffPatch,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(*_OWNER))],
) -> UserStaffOut:
    u = await db.get(User, user_id)
    if u is None:
        raise NotFoundError("User not found")
    old_role = u.role
    data = body.model_dump(exclude_unset=True)
    if "role" in data and data["role"] == UserRole.owner and u.role != UserRole.owner:
        raise HTTPException(status_code=400, detail="Cannot promote to owner")
    for k, v in data.items():
        setattr(u, k, v)
    await db.flush()
    if "role" in data and old_role != u.role:
        await record_role_change(
            db,
            actor_user_id=actor.id,
            target_user_id=u.id,
            old_role=old_role,
            new_role=u.role,
            ip=None,
            user_agent=None,
        )
    return UserStaffOut.model_validate(u)


@router.delete("/{user_id}", status_code=204)
async def delete_user(
    user_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(*_OWNER))],
) -> None:
    if user_id == actor.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")
    u = await db.get(User, user_id)
    if u is None:
        raise NotFoundError("User not found")
    u.is_active = False
    await record_event(
        db,
        user_id=actor.id,
        action="user.deactivated",
        entity_type="user",
        entity_id=u.id,
        payload={},
    )


@router.post("/invites", response_model=InviteCreatedResponse)
async def create_invite(
    body: InviteCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(*_OWNER))],
) -> InviteCreatedResponse:
    if body.role == UserRole.owner:
        raise HTTPException(status_code=400, detail="Cannot invite owner")
    email_norm = body.email.lower()
    raw = secrets.token_urlsafe(32)
    exp = datetime.now(tz=UTC) + timedelta(days=7)
    inv = UserInvite(
        email=email_norm,
        role=body.role,
        first_name=body.first_name,
        last_name=body.last_name,
        token_hash=_hash_invite(raw),
        expires_at=exp,
        created_by_user_id=actor.id,
    )
    db.add(inv)
    await db.flush()
    invite_url = f"/login?invite={raw}"
    await record_event(
        db,
        user_id=actor.id,
        action="user.invite_created",
        entity_type="user_invite",
        entity_id=inv.id,
        payload={"email": email_norm},
    )
    return InviteCreatedResponse(token=raw, invite_url=invite_url, expires_at=exp)
