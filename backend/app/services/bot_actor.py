"""Пользователь staff (owner) для операций бота от имени API."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.models.enums import UserRole
from app.models.user import User


async def get_bot_actor_user(db: AsyncSession) -> User:
    """Первая учётная запись owner — для create_booking / cancel без JWT клиента."""
    u = (
        await db.execute(
            select(User)
            .where(User.role == UserRole.owner, User.is_active.is_(True))
            .order_by(User.created_at.asc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if u is None:
        raise NotFoundError("No owner user for bot operations")
    return u
