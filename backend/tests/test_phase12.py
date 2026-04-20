"""Phase 12: салон, blacklist, users (smoke)."""

from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from passlib.context import CryptContext

from app.db.base import get_async_session_factory
from app.models.client import Client
from app.models.enums import ClientSource, ThemePreset, UserRole
from app.models.salon import Salon, Settings
from app.models.user import User

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)


async def _auth_headers(client: AsyncClient, email: str, password: str) -> dict[str, str]:
    r = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
        headers={"X-Test-Rate-Bucket": str(uuid.uuid4())},
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.mark.asyncio
async def test_get_patch_salon_owner(client: AsyncClient, test_user_owner) -> None:
    h = await _auth_headers(client, "owner@example.com", "secretpass12")
    factory = get_async_session_factory()
    async with factory() as s:
        salon = Salon(
            name="S",
            description={"en": "x"},
            timezone="Europe/Sofia",
            currency="EUR",
            default_lang="en",
        )
        s.add(salon)
        await s.flush()
        s.add(Settings(salon_id=salon.id, theme=ThemePreset.premium_light, primary_color="#D97757"))
        await s.commit()

    r = await client.get("/api/v1/salon", headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["salon"]["currency"] == "EUR"

    r2 = await client.patch(
        "/api/v1/salon",
        headers=h,
        json={"salon": {"currency": "USD"}, "settings": {"prepayment_enabled": True, "prepayment_percent": 25}},
    )
    assert r2.status_code == 200, r2.text
    body = r2.json()
    assert body["salon"]["currency"] == "USD"
    assert body["settings"]["prepayment_percent"] == 25


@pytest.mark.asyncio
async def test_blacklist_crud(client: AsyncClient, test_user_owner) -> None:
    h = await _auth_headers(client, "owner@example.com", "secretpass12")
    factory = get_async_session_factory()
    async with factory() as s:
        cl = Client(first_name="B", lang="en", source=ClientSource.manual)
        s.add(cl)
        await s.commit()
        await s.refresh(cl)
        cid = str(cl.id)

    r = await client.post("/api/v1/blacklist", headers=h, json={"client_id": cid, "reason": "spam"})
    assert r.status_code == 200, r.text
    bid = r.json()["id"]

    r2 = await client.get("/api/v1/blacklist", headers=h)
    assert r2.status_code == 200
    assert any(x["id"] == bid for x in r2.json()["items"])

    r3 = await client.delete(f"/api/v1/blacklist/{bid}", headers=h)
    assert r3.status_code == 204


@pytest.mark.asyncio
async def test_users_list_owner(client: AsyncClient, test_user_owner) -> None:
    h = await _auth_headers(client, "owner@example.com", "secretpass12")
    r = await client.get("/api/v1/users", headers=h)
    assert r.status_code == 200
    assert r.json()["total"] >= 1


@pytest.mark.asyncio
async def test_admin_ai_patch_only(client: AsyncClient, test_user_owner) -> None:
    factory = get_async_session_factory()
    async with factory() as s:
        salon = Salon(
            name="S2",
            description={"en": "x"},
            timezone="Europe/Sofia",
            currency="EUR",
            default_lang="en",
        )
        s.add(salon)
        await s.flush()
        s.add(Settings(salon_id=salon.id, theme=ThemePreset.premium_light, primary_color="#D97757"))
        au = User(
            email="adm12@example.com",
            password_hash=_pwd.hash("secretpass12"),
            role=UserRole.admin,
            first_name="A",
            lang="en",
            is_active=True,
        )
        s.add(au)
        await s.commit()

    ah = await _auth_headers(client, "adm12@example.com", "secretpass12")

    bad = await client.patch(
        "/api/v1/salon",
        headers=ah,
        json={"settings": {"theme": "premium_dark"}},
    )
    assert bad.status_code == 400

    ok = await client.patch(
        "/api/v1/salon",
        headers=ah,
        json={"settings": {"ai_temperature": 0.4}},
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["settings"]["ai_temperature"] == 0.4


@pytest.mark.asyncio
async def test_put_settings_theme_any_authenticated_staff(
    client: AsyncClient, test_user_owner, test_user_master
) -> None:
    """Мастер может менять тему салона (PUT /settings/theme)."""
    factory = get_async_session_factory()
    async with factory() as s:
        salon = Salon(
            name="S",
            description={"en": "x"},
            timezone="Europe/Sofia",
            currency="EUR",
            default_lang="en",
        )
        s.add(salon)
        await s.flush()
        s.add(Settings(salon_id=salon.id, theme=ThemePreset.premium_light, primary_color="#D97757"))
        await s.commit()

    h = await _auth_headers(client, "master@example.com", "secretpass12")
    r = await client.put(
        "/api/v1/settings/theme",
        headers=h,
        json={"theme": "premium_dark"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["theme"] == "premium_dark"

    r2 = await client.put(
        "/api/v1/settings/theme",
        headers=h,
        json={"theme": "premium_light"},
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["theme"] == "premium_light"
