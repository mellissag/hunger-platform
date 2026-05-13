"""Сотрудники: CRUD и инвайты (owner)."""

from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from redis.asyncio import Redis
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.core.permissions import get_effective_permissions
from app.core.security import hash_password, verify_password
from app.core.user_page_permissions import (
    default_permissions_for_role,
    get_merged_permissions_cached,
    invalidate_user_permissions_cache,
    merged_permissions,
    sanitize_permissions_payload,
)
from app.deps import get_current_user, get_db, get_redis, require_roles
from app.models.broadcast import Broadcast
from app.models.enums import UserRole
from app.models.user import User
from app.models.user_invite import UserInvite
from app.schemas.common import PaginatedResponse
from app.schemas.users_admin import (
    InviteCreate,
    InviteCreatedResponse,
    UserPasswordChange,
    UserStaffCreate,
    UserStaffOut,
    UserStaffPatch,
)
from app.services.audit_log import record_event, record_role_change

router = APIRouter(prefix="/users", tags=["users"])

_OWNER = (UserRole.owner,)
_OWNER_OR_ADMIN = (UserRole.owner, UserRole.admin)


def _hash_invite(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _to_out(u: User) -> UserStaffOut:
    out = UserStaffOut.model_validate(u)
    out.effective_permissions = get_effective_permissions(u)
    out.page_permissions = merged_permissions(u)
    return out


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
    items = [_to_out(u) for u in rows]
    return PaginatedResponse(items=items, total=int(total or 0), page=page, page_size=page_size)


@router.get("/{user_id}/permissions", response_model=dict[str, Any])
async def get_user_permissions(
    user_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    redis: Annotated[Redis | None, Depends(get_redis)],
    _actor: Annotated[User, Depends(require_roles(*_OWNER))],
) -> dict[str, Any]:
    u = await db.get(User, user_id)
    if u is None:
        raise NotFoundError("User not found")
    return await get_merged_permissions_cached(u, redis)


@router.patch("/{user_id}/permissions", response_model=dict[str, Any])
async def patch_user_permissions(
    user_id: UUID,
    body: Annotated[dict[str, Any], Body()],
    db: Annotated[AsyncSession, Depends(get_db)],
    redis: Annotated[Redis | None, Depends(get_redis)],
    _actor: Annotated[User, Depends(require_roles(*_OWNER))],
) -> dict[str, Any]:
    u = await db.get(User, user_id)
    if u is None:
        raise NotFoundError("User not found")
    if u.role == UserRole.owner:
        raise HTTPException(status_code=400, detail="Owner permissions are not editable")
    merged = sanitize_permissions_payload(body, role=u.role)
    u.permissions = merged
    await db.flush()
    await invalidate_user_permissions_cache(redis, u.id)
    return merged


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
        permissions=default_permissions_for_role(body.role.value),
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
    return _to_out(u)


@router.patch("/{user_id}", response_model=UserStaffOut)
async def patch_user(
    user_id: UUID,
    body: UserStaffPatch,
    db: Annotated[AsyncSession, Depends(get_db)],
    redis: Annotated[Redis | None, Depends(get_redis)],
    actor: Annotated[User, Depends(require_roles(*_OWNER))],
) -> UserStaffOut:
    u = await db.get(User, user_id)
    if u is None:
        raise NotFoundError("User not found")
    old_role = u.role
    data = body.model_dump(exclude_unset=True)
    if "role" in data and data["role"] == UserRole.owner and u.role != UserRole.owner:
        raise HTTPException(status_code=400, detail="Cannot promote to owner")
    if "email" in data:
        email_norm = data["email"].lower()
        exists = (
            await db.execute(select(User.id).where(User.email == email_norm, User.id != u.id))
        ).scalar_one_or_none()
        if exists:
            raise HTTPException(status_code=409, detail="Email already in use")
        u.email = email_norm
        del data["email"]
    for k, v in data.items():
        setattr(u, k, v)
    await db.flush()
    if "role" in data and old_role != u.role:
        u.permissions = default_permissions_for_role(u.role.value)
        await invalidate_user_permissions_cache(redis, u.id)
        await record_role_change(
            db,
            actor_user_id=actor.id,
            target_user_id=u.id,
            old_role=old_role,
            new_role=u.role,
            ip=None,
            user_agent=None,
        )
    return _to_out(u)


@router.post("/{user_id}/change-password", status_code=200)
async def change_password(
    user_id: UUID,
    body: UserPasswordChange,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(*_OWNER_OR_ADMIN))],
) -> dict:
    u = await db.get(User, user_id)
    if u is None:
        raise NotFoundError("User not found")

    if body.new_password != body.new_password_confirm:
        raise HTTPException(status_code=400, detail="Passwords do not match")

    # Пользователь меняет себе — нужен старый пароль
    if actor.id == user_id:
        if not body.old_password:
            raise HTTPException(status_code=400, detail="old_password required")
        if not verify_password(body.old_password, u.password_hash):
            raise HTTPException(status_code=400, detail="Incorrect current password")
    elif actor.role != UserRole.owner:
        raise HTTPException(status_code=403, detail="Only owner can change other users passwords")

    u.password_hash = hash_password(body.new_password)
    await db.flush()
    await record_event(
        db,
        user_id=actor.id,
        action="user.password_changed",
        entity_type="user",
        entity_id=u.id,
        payload={"changed_by": str(actor.id)},
    )
    return {"ok": True}


@router.delete("/{user_id}/permissions", status_code=200)
async def reset_permissions(
    user_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    redis: Annotated[Redis | None, Depends(get_redis)],
    _actor: Annotated[User, Depends(require_roles(*_OWNER))],
) -> dict:
    u = await db.get(User, user_id)
    if u is None:
        raise NotFoundError("User not found")
    if u.role == UserRole.owner:
        raise HTTPException(status_code=400, detail="Cannot reset owner permissions")
    u.permissions = default_permissions_for_role(u.role.value)
    await db.flush()
    await invalidate_user_permissions_cache(redis, u.id)
    return {"ok": True, "effective_permissions": get_effective_permissions(u)}


@router.delete("/{user_id}", status_code=204)
async def delete_user(
    user_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(*_OWNER))],
) -> None:
    """Hard-delete a staff member.

    The user row is removed from the database so the account can no longer
    sign in. Related rows are handled via FK constraints (cascade for
    sessions, SET NULL for audit/booking/etc.). Broadcasts have a RESTRICT
    FK and are re-assigned to the actor to preserve history.
    """
    if user_id == actor.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    u = await db.get(User, user_id)
    if u is None:
        raise NotFoundError("User not found")
    if u.role == UserRole.owner:
        raise HTTPException(status_code=400, detail="Cannot delete an owner account")

    snapshot = {
        "email": u.email,
        "role": u.role.value,
        "first_name": u.first_name,
        "last_name": u.last_name,
        "master_id": str(u.master_id) if u.master_id else None,
    }

    await db.execute(
        update(Broadcast)
        .where(Broadcast.created_by_user_id == user_id)
        .values(created_by_user_id=actor.id)
    )

    try:
        await db.delete(u)
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="User has related records that prevent deletion",
        ) from exc

    await record_event(
        db,
        user_id=actor.id,
        action="user.deleted",
        entity_type="user",
        entity_id=user_id,
        payload=snapshot,
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
