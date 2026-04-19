"""Интеграционные тесты CRUD (Phase 3) против Postgres (testcontainers)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
import pytest_asyncio
from httpx import AsyncClient

from app.db.base import get_async_session_factory
from app.models.booking import BlacklistEntry, Booking
from app.models.catalog import MasterService, Service, ServiceCategory
from app.models.client import Client
from app.models.enums import BookingCreatedVia, BookingStatus, ClientSource, PrepaymentStatus
from app.models.master import Master
from app.models.user import User


async def _auth_headers(client: AsyncClient, email: str, password: str) -> dict[str, str]:
    r = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
        headers={"X-Test-Rate-Bucket": str(uuid.uuid4())},
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest_asyncio.fixture
async def owner_headers(client: AsyncClient, test_user_owner):
    return await _auth_headers(client, "owner@example.com", "secretpass12")


@pytest_asyncio.fixture
async def domain_seed(owner_headers: dict[str, str]):
    """Мастер, услуга, связь master_service, клиент."""
    factory = get_async_session_factory()
    async with factory() as s:
        m = Master(
            display_name="Master One",
            bio={"en": "x", "ru": "", "uk": "", "bg": ""},
            specialization={"en": "s", "ru": "", "uk": "", "bg": ""},
        )
        s.add(m)
        await s.flush()
        cat = ServiceCategory(
            name_i18n={"en": "Cat", "ru": "", "uk": "", "bg": ""},
            sort_order=0,
        )
        s.add(cat)
        await s.flush()
        svc = Service(
            category_id=cat.id,
            name_i18n={"en": "Cut", "ru": "", "uk": "", "bg": ""},
            description_i18n={"en": "", "ru": "", "uk": "", "bg": ""},
            duration_minutes=60,
            price=Decimal("50.00"),
            is_active=True,
            sort_order=0,
        )
        s.add(svc)
        await s.flush()
        s.add(
            MasterService(
                master_id=m.id,
                service_id=svc.id,
            )
        )
        cl = Client(
            first_name="Ann",
            last_name="Doe",
            lang="en",
            source=ClientSource.manual,
        )
        s.add(cl)
        await s.commit()
        await s.refresh(m)
        await s.refresh(svc)
        await s.refresh(cl)
        return {
            "headers": owner_headers,
            "master_id": str(m.id),
            "service_id": str(svc.id),
            "client_id": str(cl.id),
        }


@pytest.mark.asyncio
async def test_client_list_includes_booking_aggregates(
    client: AsyncClient, domain_seed: dict[str, str]
) -> None:
    h = domain_seed["headers"]
    mid = uuid.UUID(domain_seed["master_id"])
    sid = uuid.UUID(domain_seed["service_id"])
    cid = uuid.UUID(domain_seed["client_id"])

    factory = get_async_session_factory()
    async with factory() as s:
        s.add(
            Booking(
                client_id=cid,
                master_id=mid,
                service_id=sid,
                starts_at=datetime.now(tz=UTC) + timedelta(days=1),
                ends_at=datetime.now(tz=UTC) + timedelta(days=1, hours=1),
                status=BookingStatus.completed,
                price=Decimal("50.00"),
                prepayment_status=PrepaymentStatus.none,
                created_via=BookingCreatedVia.admin,
            )
        )
        await s.commit()

    r = await client.get("/api/v1/clients?page=1&page_size=20", headers=h)
    assert r.status_code == 200
    data = r.json()
    assert data["total"] >= 1
    row = next(x for x in data["items"] if x["id"] == str(cid))
    assert row["total_bookings"] == 1
    assert Decimal(row["total_revenue"]) == Decimal("50.00")


@pytest.mark.asyncio
async def test_booking_slot_taken_returns_409(client: AsyncClient, domain_seed: dict[str, str]) -> None:
    h = domain_seed["headers"]
    mid = domain_seed["master_id"]
    sid = domain_seed["service_id"]
    cid = domain_seed["client_id"]
    t0 = datetime.now(tz=UTC).replace(microsecond=0) + timedelta(days=3)

    body = {
        "client_id": cid,
        "master_id": mid,
        "service_id": sid,
        "starts_at": t0.isoformat(),
        "created_via": "admin",
    }
    r1 = await client.post("/api/v1/bookings", json=body, headers=h)
    assert r1.status_code == 200, r1.text
    r2 = await client.post("/api/v1/bookings", json=body, headers=h)
    assert r2.status_code == 409
    assert r2.json()["code"] == "slot_taken"


@pytest.mark.asyncio
async def test_booking_blacklist_forbidden(client: AsyncClient, domain_seed: dict[str, str]) -> None:
    h = domain_seed["headers"]
    mid = uuid.UUID(domain_seed["master_id"])
    sid = uuid.UUID(domain_seed["service_id"])
    cid = uuid.UUID(domain_seed["client_id"])

    factory = get_async_session_factory()
    async with factory() as s:
        s.add(BlacklistEntry(client_id=cid, reason="spam"))
        await s.commit()

    t0 = datetime.now(tz=UTC).replace(microsecond=0) + timedelta(days=5)
    body = {
        "client_id": str(cid),
        "master_id": str(mid),
        "service_id": str(sid),
        "starts_at": t0.isoformat(),
        "created_via": "admin",
    }
    r = await client.post("/api/v1/bookings", json=body, headers=h)
    assert r.status_code == 403
    assert r.json()["code"] == "client_blacklisted"


@pytest.mark.asyncio
async def test_booking_master_must_offer_service(client: AsyncClient, domain_seed: dict[str, str]) -> None:
    h = domain_seed["headers"]
    mid = domain_seed["master_id"]
    cid = domain_seed["client_id"]

    factory = get_async_session_factory()
    async with factory() as s:
        svc2 = Service(
            category_id=None,
            name_i18n={"en": "Other", "ru": "", "uk": "", "bg": ""},
            description_i18n={"en": "", "ru": "", "uk": "", "bg": ""},
            duration_minutes=30,
            price=Decimal("10.00"),
            is_active=True,
            sort_order=0,
        )
        s.add(svc2)
        await s.commit()
        await s.refresh(svc2)
        sid2 = str(svc2.id)

    t0 = datetime.now(tz=UTC).replace(microsecond=0) + timedelta(days=6)
    body = {
        "client_id": cid,
        "master_id": mid,
        "service_id": sid2,
        "starts_at": t0.isoformat(),
        "created_via": "admin",
    }
    r = await client.post("/api/v1/bookings", json=body, headers=h)
    assert r.status_code == 409
    assert r.json()["code"] == "master_service_mismatch"


@pytest.mark.asyncio
async def test_master_sees_only_own_bookings(
    client: AsyncClient, test_user_master
) -> None:
    factory = get_async_session_factory()
    async with factory() as s:
        m = Master(
            display_name="M2",
            bio={"en": "", "ru": "", "uk": "", "bg": ""},
            specialization={"en": "", "ru": "", "uk": "", "bg": ""},
        )
        s.add(m)
        await s.flush()
        u = await s.get(User, test_user_master)
        assert u is not None
        u.master_id = m.id
        cat = ServiceCategory(
            name_i18n={"en": "C", "ru": "", "uk": "", "bg": ""},
            sort_order=0,
        )
        s.add(cat)
        await s.flush()
        svc = Service(
            category_id=cat.id,
            name_i18n={"en": "S", "ru": "", "uk": "", "bg": ""},
            description_i18n={"en": "", "ru": "", "uk": "", "bg": ""},
            duration_minutes=60,
            price=Decimal("20.00"),
            is_active=True,
            sort_order=0,
        )
        s.add(svc)
        await s.flush()
        s.add(MasterService(master_id=m.id, service_id=svc.id))
        cl = Client(first_name="X", lang="en", source=ClientSource.manual)
        s.add(cl)
        await s.flush()
        s.add(
            Booking(
                client_id=cl.id,
                master_id=m.id,
                service_id=svc.id,
                starts_at=datetime.now(tz=UTC) + timedelta(days=7),
                ends_at=datetime.now(tz=UTC) + timedelta(days=7, hours=1),
                status=BookingStatus.confirmed,
                price=Decimal("20.00"),
                prepayment_status=PrepaymentStatus.none,
                created_via=BookingCreatedVia.admin,
            )
        )
        await s.commit()

    mh = await _auth_headers(client, "master@example.com", "secretpass12")
    r = await client.get("/api/v1/bookings", headers=mh)
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["master_id"] == str(m.id)
