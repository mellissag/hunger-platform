"""FastAPI dependencies: БД, Redis, текущий пользователь, RBAC."""

from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable
from functools import lru_cache
from typing import Annotated, cast

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.security import decode_access_token, parse_access_payload
from app.db.base import get_async_session_factory
from app.models.enums import UserRole
from app.models.user import User

security_bearer = HTTPBearer(auto_error=False)

_redis: Redis | None = None


@lru_cache
def _redis_singleton() -> Redis | None:
    settings = get_settings()
    if not settings.redis_url:
        return None
    return cast(Redis, Redis.from_url(settings.redis_url, decode_responses=True))


async def get_redis() -> AsyncIterator[Redis | None]:
    yield _redis_singleton()


async def get_db() -> AsyncIterator[AsyncSession]:
    factory = get_async_session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security_bearer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = credentials.credentials
    try:
        payload = decode_access_token(token)
        user_id, _role = parse_access_payload(payload)
    except (JWTError, ValueError, KeyError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def require_roles(*allowed: UserRole) -> Callable[..., Awaitable[User]]:
    """Защита эндпоинта списком ролей (RBAC)."""

    allowed_set = frozenset(allowed)

    async def _guard(user: Annotated[User, Depends(get_current_user)]) -> User:
        if user.role not in allowed_set:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return user

    return _guard
