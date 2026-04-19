"""Аутентификация: login, refresh, logout, /me."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
import hashlib

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.permissions import RolesRequired
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from app.deps import get_current_user, get_db, require_roles
from app.limiter import limiter
from app.models.user import AuthSession, User
from app.models.user_invite import UserInvite
from app.schemas.auth import (
    InviteAcceptRequest,
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    TokenPairResponse,
    UserMeResponse,
)
from app.services.audit_log import record_auth_login, record_auth_logout

router = APIRouter()


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:128] or None
    if request.client:
        return request.client.host
    return None


def _client_ua(request: Request) -> str | None:
    ua = request.headers.get("user-agent")
    if ua is None:
        return None
    return ua[:2048]


def _hash_invite_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


@router.post("/invite/accept", response_model=TokenPairResponse)
@limiter.limit("10 per hour")
async def accept_invite(
    request: Request,
    body: InviteAcceptRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenPairResponse:
    settings = get_settings()
    th = _hash_invite_token(body.token.strip())
    now = datetime.now(tz=UTC)
    res = await db.execute(
        select(UserInvite).where(
            UserInvite.token_hash == th,
            UserInvite.used_at.is_(None),
            UserInvite.expires_at > now,
        )
    )
    inv = res.scalar_one_or_none()
    if inv is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired invite",
        )
    exists = (await db.execute(select(User.id).where(User.email == inv.email))).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    u = User(
        email=inv.email,
        password_hash=hash_password(body.password),
        role=inv.role,
        first_name=inv.first_name,
        last_name=inv.last_name,
        lang="en",
        is_active=True,
    )
    db.add(u)
    await db.flush()
    inv.used_at = now
    raw_refresh = generate_refresh_token()
    token_hash = hash_refresh_token(raw_refresh)
    expires_at = now + timedelta(days=settings.refresh_token_expire_days)
    sess = AuthSession(
        user_id=u.id,
        token_hash=token_hash,
        expires_at=expires_at,
        ip=_client_ip(request),
        user_agent=_client_ua(request),
    )
    db.add(sess)
    await db.flush()
    access = create_access_token(user_id=u.id, role=u.role.value)
    return TokenPairResponse(
        access_token=access,
        refresh_token=raw_refresh,
        expires_in=settings.access_token_expire_minutes * 60,
    )


@router.post("/login", response_model=TokenPairResponse)
@limiter.limit("5 per 15 minutes")
async def login(
    request: Request,
    body: LoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenPairResponse:
    settings = get_settings()
    email_norm = body.email.lower()

    result = await db.execute(select(User).where(User.email == email_norm))
    user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    user.last_login_at = datetime.now(tz=UTC)
    raw_refresh = generate_refresh_token()
    token_hash = hash_refresh_token(raw_refresh)
    expires_at = datetime.now(tz=UTC) + timedelta(days=settings.refresh_token_expire_days)

    sess = AuthSession(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at,
        ip=_client_ip(request),
        user_agent=_client_ua(request),
    )
    db.add(sess)
    await db.flush()

    await record_auth_login(
        db,
        user_id=user.id,
        ip=_client_ip(request),
        user_agent=_client_ua(request),
        email_hint=email_norm,
    )

    access = create_access_token(user_id=user.id, role=user.role.value)
    return TokenPairResponse(
        access_token=access,
        refresh_token=raw_refresh,
        expires_in=settings.access_token_expire_minutes * 60,
    )


@router.post("/refresh", response_model=TokenPairResponse)
async def refresh_tokens(
    body: RefreshRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenPairResponse:
    settings = get_settings()
    th = hash_refresh_token(body.refresh_token)
    now = datetime.now(tz=UTC)

    result = await db.execute(
        select(AuthSession).where(
            AuthSession.token_hash == th,
            AuthSession.revoked_at.is_(None),
            AuthSession.expires_at > now,
        )
    )
    old = result.scalar_one_or_none()
    if old is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    user_result = await db.execute(select(User).where(User.id == old.user_id))
    user = user_result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    old.revoked_at = now

    raw_refresh = generate_refresh_token()
    new_hash = hash_refresh_token(raw_refresh)
    expires_at = now + timedelta(days=settings.refresh_token_expire_days)
    new_sess = AuthSession(
        user_id=user.id,
        token_hash=new_hash,
        expires_at=expires_at,
        ip=old.ip,
        user_agent=old.user_agent,
    )
    db.add(new_sess)

    access = create_access_token(user_id=user.id, role=user.role.value)
    return TokenPairResponse(
        access_token=access,
        refresh_token=raw_refresh,
        expires_in=settings.access_token_expire_minutes * 60,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    body: LogoutRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    th = hash_refresh_token(body.refresh_token)
    now = datetime.now(tz=UTC)

    result = await db.execute(
        select(AuthSession).where(
            AuthSession.token_hash == th,
            AuthSession.revoked_at.is_(None),
            AuthSession.expires_at > now,
        )
    )
    sess = result.scalar_one_or_none()
    if sess is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    user_result = await db.execute(select(User).where(User.id == sess.user_id))
    user = user_result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    sess.revoked_at = now
    await record_auth_logout(
        db,
        user_id=user.id,
        session_id=sess.id,
        ip=_client_ip(request),
        user_agent=_client_ua(request),
    )


@router.get("/me", response_model=UserMeResponse)
async def read_me(
    user: Annotated[User, Depends(get_current_user)],
) -> User:
    return user


@router.get(
    "/rbac/admins",
    response_model=dict[str, bool],
    dependencies=[Depends(require_roles(*RolesRequired.ADMINS.value))],
)
async def rbac_admins_probe() -> dict[str, bool]:
    """Проверка RBAC (тесты и отладка)."""
    return {"ok": True}
