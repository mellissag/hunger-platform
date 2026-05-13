"""Настройки отображения (тема) — доступны любому аутентифицированному сотруднику."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.deps import get_current_user, get_db, get_redis, require_roles
from app.models.enums import UserRole
from app.models.salon import Salon, Settings
from app.models.user import User
from app.schemas.role_permissions import (
    AdminRoleState,
    ReceptionPagesState,
    ReceptionRoleState,
    RolePermissionsOut,
    RolePermissionsPatch,
)
from app.schemas.salon_admin import SettingsOut
from app.schemas.settings import ThemeUpdate
from app.services import role_permissions_service

router = APIRouter(prefix="/settings", tags=["settings"])


@router.put("/theme", response_model=SettingsOut)
async def update_theme(
    data: ThemeUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(get_current_user)],
) -> SettingsOut:
    row = (
        await db.execute(select(Salon, Settings).join(Settings, Settings.salon_id == Salon.id))
    ).first()
    if row is None:
        raise NotFoundError("Salon not configured")
    _salon, settings = row
    settings.theme = data.theme
    await db.flush()
    await db.refresh(settings)
    return SettingsOut.model_validate(settings)


@router.get("/role-permissions", response_model=RolePermissionsOut)
async def get_role_permissions(
    db: Annotated[AsyncSession, Depends(get_db)],
    redis: Annotated[Redis | None, Depends(get_redis)],
    _user: Annotated[User, Depends(require_roles(UserRole.owner))],
) -> RolePermissionsOut:
    merged = await role_permissions_service.get_merged_role_permissions(db, redis)

    admin = merged.get("admin") or {}
    rec = merged.get("reception") or {}
    pages = (rec.get("pages") or {}) if isinstance(rec, dict) else {}
    return RolePermissionsOut(
        admin=AdminRoleState(clients_access=bool(admin.get("clients_access", True))),
        reception=ReceptionRoleState(
            pages=ReceptionPagesState(
                bookings=bool(pages.get("bookings", True)),
                clients=bool(pages.get("clients", True)),
                schedule=bool(pages.get("schedule", True)),
                analytics=bool(pages.get("analytics", True)),
            )
        ),
    )


@router.patch("/role-permissions", response_model=RolePermissionsOut)
async def patch_role_permissions(
    body: RolePermissionsPatch,
    db: Annotated[AsyncSession, Depends(get_db)],
    redis: Annotated[Redis | None, Depends(get_redis)],
    _user: Annotated[User, Depends(require_roles(UserRole.owner))],
) -> RolePermissionsOut:
    admin_patch = body.admin if isinstance(body.admin, dict) else None
    rec_in = body.reception if isinstance(body.reception, dict) else None
    reception_pages_patch: dict[str, bool] | None = None
    if rec_in and isinstance(rec_in.get("pages"), dict):
        reception_pages_patch = {str(k): bool(v) for k, v in rec_in["pages"].items()}

    merged = await role_permissions_service.patch_stored_role_permissions(
        db,
        redis,
        admin_patch=admin_patch,
        reception_pages_patch=reception_pages_patch,
    )

    admin = merged.get("admin") or {}
    rec = merged.get("reception") or {}
    pages = (rec.get("pages") or {}) if isinstance(rec, dict) else {}
    return RolePermissionsOut(
        admin=AdminRoleState(clients_access=bool(admin.get("clients_access", True))),
        reception=ReceptionRoleState(
            pages=ReceptionPagesState(
                bookings=bool(pages.get("bookings", True)),
                clients=bool(pages.get("clients", True)),
                schedule=bool(pages.get("schedule", True)),
                analytics=bool(pages.get("analytics", True)),
            )
        ),
    )
