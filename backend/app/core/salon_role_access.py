"""Salon-level tab access (reception pages, admin clients tab) + master page_*."""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import Depends, HTTPException, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import has_permission
from app.deps import get_current_user, get_db, get_redis, require_roles
from app.models.enums import UserRole
from app.models.user import User
from app.services import role_permissions_service

STAFF_ALL = (UserRole.owner, UserRole.admin, UserRole.reception, UserRole.master)
STAFF_READ_ROLES = (UserRole.owner, UserRole.admin, UserRole.reception, UserRole.master)

PageKey = Literal["bookings", "clients", "schedule", "analytics"]

MASTER_PAGE_PERM: dict[PageKey, str] = {
    "bookings": "page_bookings",
    "clients": "page_clients",
    "schedule": "page_schedule",
    "analytics": "page_statistics",
}


async def assert_salon_clients_tab_access(
    user: User,
    db: AsyncSession,
    redis: Redis | None,
) -> None:
    if user.role == UserRole.owner:
        return
    if user.role == UserRole.admin:
        if not await role_permissions_service.admin_clients_access_allowed(db, redis):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="no_clients_access")
        return
    if user.role == UserRole.reception:
        if not await role_permissions_service.reception_page_allowed(db, redis, "clients"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="no_page_access")
        return
    if user.role == UserRole.master:
        if not has_permission(user, "page_clients"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="no_page_access")
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="no_page_access")


async def assert_salon_page_tab_access(
    user: User,
    db: AsyncSession,
    redis: Redis | None,
    page: PageKey,
) -> None:
    if user.role == UserRole.owner:
        return
    if user.role == UserRole.admin:
        return
    if user.role == UserRole.reception:
        if not await role_permissions_service.reception_page_allowed(db, redis, page):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="no_page_access")
        return
    if user.role == UserRole.master:
        pk = MASTER_PAGE_PERM[page]
        if not has_permission(user, pk):
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


async def assert_stats_tab_access(user: User, db: AsyncSession, redis: Redis | None) -> None:
    """Statistics: owner/admin; master needs page_statistics; reception needs reception.pages.analytics."""
    if user.role in (UserRole.owner, UserRole.admin):
        return
    if user.role == UserRole.master:
        if not has_permission(user, "page_statistics"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="no_page_access")
        return
    if user.role == UserRole.reception:
        if not await role_permissions_service.reception_page_allowed(db, redis, "analytics"):
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
