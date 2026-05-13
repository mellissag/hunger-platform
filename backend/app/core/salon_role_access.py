"""Доступ к вкладкам CRM по дереву прав пользователя (не глобальные role_permissions)."""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import Depends, HTTPException, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.user_page_permissions import page_perm
from app.deps import get_current_user, get_db, get_redis, require_roles
from app.models.enums import UserRole
from app.models.user import User

STAFF_ALL = (UserRole.owner, UserRole.admin, UserRole.reception, UserRole.master)
STAFF_READ_ROLES = (UserRole.owner, UserRole.admin, UserRole.reception, UserRole.master)

PageKey = Literal["bookings", "clients", "schedule", "analytics"]

MASTER_PAGE_SECTION: dict[PageKey, tuple[str, str]] = {
    "bookings": ("bookings", "enabled"),
    "clients": ("clients", "enabled"),
    "schedule": ("schedule", "enabled"),
    "analytics": ("analytics", "enabled"),
}


async def assert_salon_clients_tab_access(
    user: User,
    _db: AsyncSession,
    _redis: Redis | None,
) -> None:
    if user.role == UserRole.owner:
        return
    if user.role == UserRole.admin:
        if not page_perm(user, "clients", "enabled"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="no_clients_access")
        return
    if user.role == UserRole.reception:
        if not page_perm(user, "clients", "enabled"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="no_page_access")
        return
    if user.role == UserRole.master:
        if not page_perm(user, "clients", "enabled"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="no_page_access")
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="no_page_access")


async def assert_salon_page_tab_access(
    user: User,
    _db: AsyncSession,
    _redis: Redis | None,
    page: PageKey,
) -> None:
    if user.role == UserRole.owner:
        return
    if user.role == UserRole.admin:
        return
    if user.role == UserRole.reception:
        sec, key = {
            "bookings": ("bookings", "enabled"),
            "clients": ("clients", "enabled"),
            "schedule": ("schedule", "enabled"),
            "analytics": ("analytics", "enabled"),
        }[page]
        if not page_perm(user, sec, key):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="no_page_access")
        return
    if user.role == UserRole.master:
        sec, key = MASTER_PAGE_SECTION[page]
        if not page_perm(user, sec, key):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="no_page_access")
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="no_page_access")


def staff_with_clients_tab(*staff_roles: UserRole):
    allowed = frozenset(staff_roles)

    async def _dep(
        user: Annotated[User, Depends(get_current_user)],
        db: Annotated[AsyncSession, Depends(get_db)],
        redis: Annotated[Redis | None, Depends(get_redis)],
    ) -> User:
        if user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        await assert_salon_clients_tab_access(user, db, redis)
        return user

    return _dep


def staff_with_salon_page(page: PageKey, *staff_roles: UserRole):
    allowed = frozenset(staff_roles)

    async def _dep(
        user: Annotated[User, Depends(get_current_user)],
        db: Annotated[AsyncSession, Depends(get_db)],
        redis: Annotated[Redis | None, Depends(get_redis)],
    ) -> User:
        if user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        await assert_salon_page_tab_access(user, db, redis, page)
        return user

    return _dep


async def assert_stats_tab_access(user: User, _db: AsyncSession, _redis: Redis | None) -> None:
    if user.role in (UserRole.owner, UserRole.admin):
        return
    if user.role == UserRole.master:
        if not page_perm(user, "analytics", "enabled"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="no_page_access")
        return
    if user.role == UserRole.reception:
        if not page_perm(user, "analytics", "enabled"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="no_page_access")
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="no_page_access")


ClientsTabUser = Annotated[User, Depends(staff_with_clients_tab(*STAFF_ALL))]
BookingsTabUser = Annotated[User, Depends(staff_with_salon_page("bookings", *STAFF_ALL))]
ScheduleReadUser = Annotated[User, Depends(staff_with_salon_page("schedule", *STAFF_READ_ROLES))]


async def stats_tab_dep(
    user: Annotated[User, Depends(require_roles(*STAFF_ALL))],
    db: Annotated[AsyncSession, Depends(get_db)],
    redis: Annotated[Redis | None, Depends(get_redis)],
) -> User:
    await assert_stats_tab_access(user, db, redis)
    return user


StatsTabUser = Annotated[User, Depends(stats_tab_dep)]
