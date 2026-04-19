"""JWT (access + refresh), bcrypt."""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import UUID

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import get_settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)


def hash_password(plain: str) -> str:
    return cast(str, pwd_context.hash(plain))


def verify_password(plain: str, hashed: str) -> bool:
    return cast(bool, pwd_context.verify(plain, hashed))


def hash_refresh_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def create_access_token(
    *,
    user_id: UUID,
    role: str,
    expires_delta: timedelta | None = None,
) -> str:
    settings = get_settings()
    expire = datetime.now(tz=UTC) + (
        expires_delta
        if expires_delta is not None
        else timedelta(minutes=settings.access_token_expire_minutes)
    )
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "role": role,
        "typ": "access",
        "jti": str(uuid.uuid4()),
        "exp": expire,
    }
    return cast(str, jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm))


def decode_access_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    return cast(dict[str, Any], jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]))


def parse_access_payload(data: dict[str, Any]) -> tuple[UUID, str]:
    if data.get("typ") != "access":
        raise JWTError("not an access token")
    sub = data.get("sub")
    if not sub:
        raise JWTError("missing sub")
    role = data.get("role")
    if not role or not isinstance(role, str):
        raise JWTError("missing role")
    return UUID(str(sub)), role
