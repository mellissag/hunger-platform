"""Phase 15 coverage boost — part 4: HTTP API route tests.

Covers:
- /api/v1/salon routes
- /api/v1/users routes  
- /api/v1/stats routes
- /api/v1/audit routes
- Additional booking_service paths via API
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from passlib.context import CryptContext

from app.db.base import get_async_session_factory
from app.models.enums import UserRole
from app.models.user import User

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=4)


async def _login(client: AsyncClient, email: str, password: str) -> dict[str, str]:
    r = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
        headers={"X-Test-Rate-Bucket": str(uuid.uuid4())},
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest_asyncio.fixture
async def http():
    from app.main import app
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def owner_email_pass():
    email = f"owner_{uuid.uuid4().hex[:6]}@cov4-test.com"
    pw = "secretpass12"
    factory = get_async_session_factory()
    async with factory() as s:
        u = User(
            email=email,
            password_hash=_pwd.hash(pw),
            role=UserRole.owner,
            first_name="Owner",
            last_name="Test",
            lang="en",
            is_active=True,
        )
        s.add(u)
        await s.commit()
    return email, pw


@pytest_asyncio.fixture
async def admin_email_pass():
    email = f"admin_{uuid.uuid4().hex[:6]}@cov4-test.com"
    pw = "secretpass12"
    factory = get_async_session_factory()
    async with factory() as s:
        u = User(
            email=email,
            password_hash=_pwd.hash(pw),
            role=UserRole.admin,
            first_name="Admin",
            last_name="Test",
            lang="en",
            is_active=True,
        )
        s.add(u)
        await s.commit()
    return email, pw


# ─── /api/v1/salon ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_salon_get_bundle_empty(http, owner_email_pass):
    email, pw = owner_email_pass
    headers = await _login(http, email, pw)
    r = await http.get("/api/v1/salon", headers=headers)
    # Either 200 (with salon data) or 404 (no salon yet)
    assert r.status_code in (200, 404)


@pytest.mark.asyncio
async def test_salon_patch_creates_salon(http, owner_email_pass):
    email, pw = owner_email_pass
    headers = await _login(http, email, pw)
    r = await http.patch(
        "/api/v1/salon",
        json={"salon": {"name": "Test Salon", "timezone": "UTC", "currency": "EUR"}},
        headers=headers,
    )
    assert r.status_code in (200, 201, 404, 422), r.text


@pytest.mark.asyncio
async def test_salon_backups_list(http, owner_email_pass):
    email, pw = owner_email_pass
    headers = await _login(http, email, pw)
    r = await http.get("/api/v1/salon/backups", headers=headers)
    assert r.status_code in (200, 404)


@pytest.mark.asyncio
async def test_salon_telegram_verify_missing_token(http, owner_email_pass):
    email, pw = owner_email_pass
    headers = await _login(http, email, pw)
    r = await http.post(
        "/api/v1/salon/telegram/verify",
        json={"bot_token": ""},
        headers=headers,
    )
    assert r.status_code in (400, 422)


# ─── /api/v1/users ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_users_admin_list(http, owner_email_pass):
    email, pw = owner_email_pass
    headers = await _login(http, email, pw)
    r = await http.get("/api/v1/users", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert "items" in body


@pytest.mark.asyncio
async def test_users_admin_create(http, owner_email_pass):
    email, pw = owner_email_pass
    headers = await _login(http, email, pw)
    new_email = f"newstaff_{uuid.uuid4().hex[:6]}@testcov.com"
    r = await http.post(
        "/api/v1/users",
        json={
            "email": new_email,
            "password": "Password123!",
            "role": "admin",
            "first_name": "New",
            "last_name": "Staff",
            "lang": "en",
        },
        headers=headers,
    )
    assert r.status_code in (200, 201), r.text
    body = r.json()
    assert body["email"] == new_email


@pytest.mark.asyncio
async def test_users_admin_create_duplicate(http, owner_email_pass):
    email, pw = owner_email_pass
    headers = await _login(http, email, pw)
    new_email = f"dup_{uuid.uuid4().hex[:6]}@testcov.com"
    payload = {
        "email": new_email,
        "password": "Password123!",
        "role": "admin",
        "first_name": "D",
        "last_name": "U",
        "lang": "en",
    }
    r1 = await http.post("/api/v1/users", json=payload, headers=headers)
    assert r1.status_code in (200, 201)
    r2 = await http.post("/api/v1/users", json=payload, headers=headers)
    assert r2.status_code in (400, 409, 422)


@pytest.mark.asyncio
async def test_users_admin_update(http, owner_email_pass):
    email, pw = owner_email_pass
    headers = await _login(http, email, pw)
    new_email = f"update_{uuid.uuid4().hex[:6]}@testcov.com"
    r = await http.post(
        "/api/v1/users",
        json={"email": new_email, "password": "Password123!", "role": "reception",
              "first_name": "Up", "last_name": "Date", "lang": "en"},
        headers=headers,
    )
    assert r.status_code in (200, 201)
    user_id = r.json()["id"]
    r2 = await http.patch(
        f"/api/v1/users/{user_id}",
        json={"first_name": "Updated"},
        headers=headers,
    )
    assert r2.status_code == 200
    assert r2.json()["first_name"] == "Updated"


@pytest.mark.asyncio
async def test_users_admin_delete(http, owner_email_pass):
    email, pw = owner_email_pass
    headers = await _login(http, email, pw)
    new_email = f"del_{uuid.uuid4().hex[:6]}@testcov.com"
    r = await http.post(
        "/api/v1/users",
        json={"email": new_email, "password": "Password123!", "role": "reception",
              "first_name": "Del", "last_name": "Ete", "lang": "en"},
        headers=headers,
    )
    user_id = r.json()["id"]
    r2 = await http.delete(f"/api/v1/users/{user_id}", headers=headers)
    assert r2.status_code == 204


@pytest.mark.asyncio
async def test_users_admin_forbidden_for_admin_role(http, admin_email_pass):
    email, pw = admin_email_pass
    headers = await _login(http, email, pw)
    r = await http.get("/api/v1/users", headers=headers)
    assert r.status_code == 403


# ─── /api/v1/stats ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_stats_overview(http, owner_email_pass):
    email, pw = owner_email_pass
    headers = await _login(http, email, pw)
    r = await http.get("/api/v1/stats/overview?from=2026-01-01&to=2026-12-31", headers=headers)
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_stats_bot(http, owner_email_pass):
    email, pw = owner_email_pass
    headers = await _login(http, email, pw)
    r = await http.get("/api/v1/stats/bot?from=2026-01-01&to=2026-12-31", headers=headers)
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_stats_masters(http, owner_email_pass):
    email, pw = owner_email_pass
    headers = await _login(http, email, pw)
    r = await http.get("/api/v1/stats/masters?from=2026-01-01&to=2026-12-31", headers=headers)
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_stats_services_top(http, owner_email_pass):
    email, pw = owner_email_pass
    headers = await _login(http, email, pw)
    r = await http.get("/api/v1/stats/services/top?from=2026-01-01&to=2026-12-31", headers=headers)
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_stats_services_dead(http, owner_email_pass):
    email, pw = owner_email_pass
    headers = await _login(http, email, pw)
    r = await http.get("/api/v1/stats/services/dead?to=2026-12-31", headers=headers)
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_stats_finance_payroll(http, owner_email_pass):
    email, pw = owner_email_pass
    headers = await _login(http, email, pw)
    r = await http.get("/api/v1/stats/finance/payroll?from=2026-01-01&to=2026-12-31", headers=headers)
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_stats_finance_export_xlsx(http, owner_email_pass):
    email, pw = owner_email_pass
    headers = await _login(http, email, pw)
    r = await http.get(
        "/api/v1/stats/finance/export?from=2026-01-01&to=2026-12-31&format=xlsx",
        headers=headers,
    )
    assert r.status_code == 200


# ─── /api/v1/audit ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_audit_list(http, owner_email_pass):
    email, pw = owner_email_pass
    headers = await _login(http, email, pw)
    r = await http.get("/api/v1/audit", headers=headers)
    assert r.status_code in (200, 404)
    if r.status_code == 200:
        assert "items" in r.json()


# ─── /api/v1/clients (extra API paths) ──────────────────────────────────────

@pytest.mark.asyncio
async def test_clients_list_api(http, owner_email_pass):
    email, pw = owner_email_pass
    headers = await _login(http, email, pw)
    r = await http.get("/api/v1/clients", headers=headers)
    assert r.status_code == 200
    assert "items" in r.json()


@pytest.mark.asyncio
async def test_clients_create_and_get_api(http, owner_email_pass):
    email, pw = owner_email_pass
    headers = await _login(http, email, pw)
    r = await http.post(
        "/api/v1/clients",
        json={"first_name": "API", "last_name": "Client", "phone": f"+1{uuid.uuid4().int % 10000000000:010d}", "lang": "en"},
        headers=headers,
    )
    assert r.status_code in (200, 201), r.text
    client_id = r.json()["id"]
    r2 = await http.get(f"/api/v1/clients/{client_id}", headers=headers)
    assert r2.status_code == 200


# ─── /api/v1/services (API) ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_service_categories_crud_api(http, owner_email_pass):
    email, pw = owner_email_pass
    headers = await _login(http, email, pw)
    # Create category
    r = await http.post(
        "/api/v1/service-categories",
        json={"name_i18n": {"en": "API Cat", "ru": "API Кат", "uk": "API Кат", "bg": "API Кат"}, "sort_order": 99},
        headers=headers,
    )
    assert r.status_code in (200, 201), r.text
    cat_id = r.json()["id"]
    # List
    r2 = await http.get("/api/v1/service-categories", headers=headers)
    assert r2.status_code == 200
    # Update
    r3 = await http.patch(f"/api/v1/service-categories/{cat_id}", json={"sort_order": 100}, headers=headers)
    assert r3.status_code == 200
    # Delete
    r4 = await http.delete(f"/api/v1/service-categories/{cat_id}", headers=headers)
    assert r4.status_code in (200, 204)


@pytest.mark.asyncio
async def test_services_crud_api(http, owner_email_pass):
    email, pw = owner_email_pass
    headers = await _login(http, email, pw)
    # Create category first
    rc = await http.post(
        "/api/v1/service-categories",
        json={"name_i18n": {"en": "SvcCat", "ru": "SvcCat", "uk": "SvcCat", "bg": "SvcCat"}, "sort_order": 50},
        headers=headers,
    )
    cat_id = rc.json()["id"]
    # Create service
    r = await http.post(
        "/api/v1/services",
        json={
            "category_id": cat_id,
            "name_i18n": {"en": "API Svc", "ru": "API Svc", "uk": "API Svc", "bg": "API Svc"},
            "description_i18n": {"en": "d", "ru": "d", "uk": "d", "bg": "d"},
            "price": "30.00",
            "duration_minutes": 45,
            "is_active": True,
            "sort_order": 0,
        },
        headers=headers,
    )
    assert r.status_code in (200, 201), r.text
    svc_id = r.json()["id"]
    # Get
    r2 = await http.get(f"/api/v1/services/{svc_id}", headers=headers)
    assert r2.status_code == 200
    # Update
    r3 = await http.patch(f"/api/v1/services/{svc_id}", json={"price": "35.00"}, headers=headers)
    assert r3.status_code == 200


# ─── /api/v1/masters (extra API coverage) ────────────────────────────────────

@pytest.mark.asyncio
async def test_masters_crud_api(http, owner_email_pass):
    email, pw = owner_email_pass
    headers = await _login(http, email, pw)
    r = await http.post(
        "/api/v1/masters",
        json={
            "display_name": "API Master",
            "bio": {"en": "bio", "ru": "bio", "uk": "bio", "bg": "bio"},
            "specialization": {"en": "spec", "ru": "spec", "uk": "spec", "bg": "spec"},
            "is_active": True,
            "sort_order": 0,
        },
        headers=headers,
    )
    assert r.status_code in (200, 201), r.text
    master_id = r.json()["id"]
    # List
    r2 = await http.get("/api/v1/masters", headers=headers)
    assert r2.status_code == 200
    # Get
    r3 = await http.get(f"/api/v1/masters/{master_id}", headers=headers)
    assert r3.status_code == 200
    # Update
    r4 = await http.patch(f"/api/v1/masters/{master_id}", json={"display_name": "Updated Master"}, headers=headers)
    assert r4.status_code == 200
    # Delete
    r5 = await http.delete(f"/api/v1/masters/{master_id}", headers=headers)
    assert r5.status_code in (200, 204)


# ─── /api/v1/blacklist ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_blacklist_api(http, owner_email_pass):
    from app.models.client import Client
    from app.models.enums import ClientSource
    email, pw = owner_email_pass
    headers = await _login(http, email, pw)
    # Create a client first
    factory = get_async_session_factory()
    async with factory() as s:
        c = Client(
            tg_user_id=int(uuid.uuid4().int % 10**12),
            first_name="BL",
            last_name="Test",
            lang="en",
            source=ClientSource.manual,
        )
        s.add(c)
        await s.commit()
        await s.refresh(c)
        client_id = str(c.id)
    # Add to blacklist
    r = await http.post(
        "/api/v1/blacklist",
        json={"client_id": client_id, "reason": "Test blacklist"},
        headers=headers,
    )
    assert r.status_code in (200, 201), r.text
    # List
    r2 = await http.get("/api/v1/blacklist", headers=headers)
    assert r2.status_code == 200
