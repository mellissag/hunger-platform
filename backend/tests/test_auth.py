"""Тесты аутентификации и RBAC (Phase 2)."""

from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import AsyncClient
from jose import JWTError
from sqlalchemy import select

from app.db.base import get_async_session_factory
from app.models.audit import AuditLog
from app.models.enums import UserRole
from app.models.user import User
from app.services.audit_log import record_role_change


@pytest.mark.asyncio
async def test_login_success(test_user_owner, client: AsyncClient, rate_bucket) -> None:
    r = await client.post(
        "/api/v1/auth/login",
        json={"email": "owner@example.com", "password": "secretpass12"},
        headers={"X-Test-Rate-Bucket": rate_bucket},
    )
    assert r.status_code == 200
    data = r.json()
    assert "access_token" in data and "refresh_token" in data
    assert data["token_type"] == "bearer"
    assert data["expires_in"] == 15 * 60

    async with get_async_session_factory()() as db:
        rows = (await db.execute(select(AuditLog).where(AuditLog.action == "auth.login"))).scalars().all()
        assert len(rows) == 1


@pytest.mark.asyncio
async def test_login_wrong_password(test_user_owner, client: AsyncClient, rate_bucket) -> None:
    r = await client.post(
        "/api/v1/auth/login",
        json={"email": "owner@example.com", "password": "wrong-password"},
        headers={"X-Test-Rate-Bucket": rate_bucket},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_login_inactive_account_correct_password(
    test_user_owner, client: AsyncClient, rate_bucket
) -> None:
    factory = get_async_session_factory()
    async with factory() as db:
        u = await db.get(User, test_user_owner)
        assert u is not None
        u.is_active = False
        await db.commit()

    r = await client.post(
        "/api/v1/auth/login",
        json={"email": "owner@example.com", "password": "secretpass12"},
        headers={"X-Test-Rate-Bucket": rate_bucket},
    )
    assert r.status_code == 403
    assert r.json().get("detail") == "account_inactive"


@pytest.mark.asyncio
async def test_login_rate_limited(test_user_owner, client: AsyncClient, rate_bucket) -> None:
    url = "/api/v1/auth/login"
    body = {"email": "owner@example.com", "password": "wrong"}
    headers = {"X-Test-Rate-Bucket": rate_bucket}
    for _ in range(5):
        await client.post(url, json=body, headers=headers)
    r = await client.post(url, json=body, headers=headers)
    assert r.status_code == 429


@pytest.mark.asyncio
async def test_refresh_rotation(test_user_owner, client: AsyncClient, rate_bucket) -> None:
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "owner@example.com", "password": "secretpass12"},
        headers={"X-Test-Rate-Bucket": rate_bucket},
    )
    old_refresh = login.json()["refresh_token"]

    ref1 = await client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh})
    assert ref1.status_code == 200
    new_access = ref1.json()["access_token"]
    new_refresh = ref1.json()["refresh_token"]

    ref_old_again = await client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh})
    assert ref_old_again.status_code == 401

    ref2 = await client.post("/api/v1/auth/refresh", json={"refresh_token": new_refresh})
    assert ref2.status_code == 200
    assert ref2.json()["access_token"] != new_access


@pytest.mark.asyncio
async def test_me_requires_auth(client: AsyncClient, rate_bucket) -> None:
    r = await client.get("/api/v1/auth/me")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_me_ok(test_user_owner, client: AsyncClient, rate_bucket) -> None:
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "owner@example.com", "password": "secretpass12"},
        headers={"X-Test-Rate-Bucket": rate_bucket},
    )
    token = login.json()["access_token"]
    r = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["email"] == "owner@example.com"


@pytest.mark.asyncio
async def test_role_required_decorator(
    test_user_owner, test_user_master, client: AsyncClient, rate_bucket
) -> None:
    admin_login = await client.post(
        "/api/v1/auth/login",
        json={"email": "owner@example.com", "password": "secretpass12"},
        headers={"X-Test-Rate-Bucket": rate_bucket},
    )
    admin_token = admin_login.json()["access_token"]

    master_login = await client.post(
        "/api/v1/auth/login",
        json={"email": "master@example.com", "password": "secretpass12"},
        headers={"X-Test-Rate-Bucket": f"{rate_bucket}-m"},
    )
    master_token = master_login.json()["access_token"]

    ok = await client.get("/api/v1/auth/rbac/admins", headers={"Authorization": f"Bearer {admin_token}"})
    assert ok.status_code == 200

    forbidden = await client.get(
        "/api/v1/auth/rbac/admins", headers={"Authorization": f"Bearer {master_token}"}
    )
    assert forbidden.status_code == 403


@pytest.mark.asyncio
async def test_audit_role_change(test_user_owner) -> None:
    factory = get_async_session_factory()
    async with factory() as db:
        other = User(
            email="u2@example.com",
            password_hash="x",
            role=UserRole.reception,
            first_name="A",
            last_name="B",
            lang="en",
            is_active=True,
        )
        db.add(other)
        await db.commit()
        await db.refresh(other)
        target_id = other.id

        await record_role_change(
            db,
            actor_user_id=test_user_owner,
            target_user_id=target_id,
            old_role=UserRole.reception,
            new_role=UserRole.admin,
            ip="127.0.0.1",
            user_agent="pytest",
        )
        await db.commit()

        row = (
            await db.execute(select(AuditLog).where(AuditLog.action == "user.role_changed"))
        ).scalar_one()
        assert row.payload is not None
        assert row.payload.get("old_role") == "reception"
        assert row.payload.get("new_role") == "admin"


@pytest.mark.asyncio
async def test_login_x_forwarded_for(test_user_owner, client: AsyncClient, rate_bucket) -> None:
    r = await client.post(
        "/api/v1/auth/login",
        json={"email": "owner@example.com", "password": "secretpass12"},
        headers={
            "X-Test-Rate-Bucket": rate_bucket,
            "X-Forwarded-For": "203.0.113.10, 10.0.0.1",
            "User-Agent": "pytest-agent",
        },
    )
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_logout_revokes_session(test_user_owner, client: AsyncClient, rate_bucket) -> None:
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "owner@example.com", "password": "secretpass12"},
        headers={"X-Test-Rate-Bucket": rate_bucket},
    )
    refresh = login.json()["refresh_token"]
    out = await client.post("/api/v1/auth/logout", json={"refresh_token": refresh})
    assert out.status_code == 204

    again = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
    assert again.status_code == 401


@pytest.mark.asyncio
async def test_refresh_fails_when_user_deactivated(test_user_owner, client: AsyncClient, rate_bucket) -> None:
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "owner@example.com", "password": "secretpass12"},
        headers={"X-Test-Rate-Bucket": rate_bucket},
    )
    refresh = login.json()["refresh_token"]

    async with get_async_session_factory()() as db:
        u = await db.get(User, test_user_owner)
        assert u is not None
        u.is_active = False
        await db.commit()

    bad = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
    assert bad.status_code == 401


@pytest.mark.asyncio
async def test_logout_invalid_refresh(client: AsyncClient) -> None:
    r = await client.post(
        "/api/v1/auth/logout",
        json={"refresh_token": "not-a-valid-refresh-token-at-all-please-reject"},
    )
    assert r.status_code == 401


def test_coverage_security_helpers() -> None:
    """Доп. покрытие веток security (parse/jwt)."""
    from app.core.security import parse_access_payload

    with pytest.raises(JWTError):
        parse_access_payload({"typ": "refresh", "sub": str(uuid4()), "role": "owner"})
