"""Фаза 4: слоты, календарь, конкурентное создание брони."""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
import pytest_asyncio
from httpx import AsyncClient

from app.db.base import get_async_session_factory
from app.models.booking import Booking
from app.models.catalog import MasterService, Service, ServiceCategory
from app.models.client import Client
from app.models.enums import (
    BookingCreatedVia,
    BookingStatus,
    ClientSource,
    PrepaymentStatus,
    ThemePreset,
)
from app.models.master import Master
from app.models.salon import Salon, Settings
from app.models.user import User
from app.schemas.booking import BookingCreate
from app.services.booking_service import SlotTakenError, create_booking
from sqlalchemy import select


async def _auth_headers(client: AsyncClient, email: str, password: str) -> dict[str, str]:
    r = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "secretpass12"},
        headers={"X-Test-Rate-Bucket": str(uuid.uuid4())},
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest_asyncio.fixture
async def owner_headers(client: AsyncClient, test_user_owner):
    return await _auth_headers(client, "owner@example.com", "secretpass12")


@pytest_asyncio.fixture
async def phase4_seed(owner_headers: dict[str, str]):
    """Салон + настройки + мастер + услуга + клиент."""
    factory = get_async_session_factory()
    async with factory() as s:
        salon = Salon(
            name="Test Salon",
            description={"en": "x"},
            timezone="UTC",
            currency="EUR",
            default_lang="en",
        )
        s.add(salon)
        await s.flush()
        s.add(
            Settings(
                salon_id=salon.id,
                theme=ThemePreset.premium_light,
                booking_lead_time_minutes=60,
                booking_buffer_minutes=5,
            )
        )
        m = Master(
            display_name="M1",
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
        s.add(MasterService(master_id=m.id, service_id=svc.id))
        cl = Client(first_name="Ann", lang="en", source=ClientSource.manual)
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
async def test_get_slots_returns_times(
    client: AsyncClient, phase4_seed: dict[str, str], fake_now
) -> None:
    """Слоты на день: полный день по умолчанию, без пересечений с существующей бронью."""
    mid = phase4_seed["master_id"]
    sid = phase4_seed["service_id"]

    day = (fake_now + timedelta(days=2)).date()
    r = await client.get(
        f"/api/v1/schedule/slots?master_id={mid}&service_id={sid}&date={day.isoformat()}",
    )
    assert r.status_code == 200, r.text
    times = r.json()["times"]
    assert len(times) > 0

    t0 = datetime.strptime(times[0], "%H:%M").time()
    factory = get_async_session_factory()
    async with factory() as s:
        start = datetime.combine(day, t0, tzinfo=UTC)
        b = Booking(
            client_id=uuid.UUID(phase4_seed["client_id"]),
            master_id=uuid.UUID(mid),
            service_id=uuid.UUID(sid),
            starts_at=start,
            ends_at=start + timedelta(hours=1),
            status=BookingStatus.confirmed,
            price=Decimal("50.00"),
            prepayment_status=PrepaymentStatus.none,
            created_via=BookingCreatedVia.admin,
        )
        s.add(b)
        await s.commit()

    r2 = await client.get(
        f"/api/v1/schedule/slots?master_id={mid}&service_id={sid}&date={day.isoformat()}",
    )
    assert r2.status_code == 200
    times2 = r2.json()["times"]
    assert times[0] not in times2


@pytest.mark.asyncio
async def test_concurrent_create_booking_single_winner(
    phase4_seed: dict[str, str], test_user_owner, fake_now
) -> None:
    """10 параллельных create_booking на один слот — успешна ровно одна."""
    uid = test_user_owner
    mid = uuid.UUID(phase4_seed["master_id"])
    sid = uuid.UUID(phase4_seed["service_id"])
    cid = uuid.UUID(phase4_seed["client_id"])

    starts_at = fake_now + timedelta(days=5)
    starts_at = starts_at.replace(hour=10, minute=0, second=0, microsecond=0)
    data = BookingCreate(
        client_id=cid,
        master_id=mid,
        service_id=sid,
        starts_at=starts_at,
        created_via=BookingCreatedVia.admin,
    )

    factory = get_async_session_factory()

    async def attempt() -> bool:
        async with factory() as session:
            user = (
                await session.execute(select(User).where(User.id == uid))
            ).scalar_one_or_none()
            assert user is not None
            try:
                await create_booking(session, user, data)
                await session.commit()
                return True
            except SlotTakenError:
                await session.rollback()
                return False

    results = await asyncio.gather(*[attempt() for _ in range(10)])
    assert sum(1 for x in results if x) == 1


@pytest.mark.asyncio
async def test_calendar_endpoint(client: AsyncClient, phase4_seed: dict[str, str]) -> None:
    h = phase4_seed["headers"]
    mid = uuid.UUID(phase4_seed["master_id"])
    sid = uuid.UUID(phase4_seed["service_id"])
    cid = uuid.UUID(phase4_seed["client_id"])

    t0 = datetime.now(tz=UTC).replace(microsecond=0) + timedelta(days=1)
    factory = get_async_session_factory()
    async with factory() as s:
        s.add(
            Booking(
                client_id=cid,
                master_id=mid,
                service_id=sid,
                starts_at=t0,
                ends_at=t0 + timedelta(hours=1),
                status=BookingStatus.confirmed,
                price=Decimal("50.00"),
                prepayment_status=PrepaymentStatus.none,
                created_via=BookingCreatedVia.admin,
            )
        )
        await s.commit()

    r = await client.get(
        "/api/v1/schedule/calendar",
        params={
            "from": (t0 - timedelta(hours=1)).isoformat(),
            "to": (t0 + timedelta(hours=2)).isoformat(),
            "master_id": str(mid),
        },
        headers=h,
    )
    assert r.status_code == 200, r.text
    assert len(r.json()["bookings"]) >= 1


@pytest.mark.asyncio
async def test_block_create_delete(client: AsyncClient, phase4_seed: dict[str, str]) -> None:
    h = phase4_seed["headers"]
    mid = phase4_seed["master_id"]
    t0 = datetime.now(tz=UTC) + timedelta(days=14)
    body = {
        "master_id": mid,
        "starts_at": t0.isoformat(),
        "ends_at": (t0 + timedelta(hours=3)).isoformat(),
        "slot_type": "block",
        "note": "lunch",
    }
    r = await client.post("/api/v1/schedule/block", json=body, headers=h)
    assert r.status_code == 200, r.text
    bid = r.json()["id"]
    r2 = await client.delete(f"/api/v1/schedule/block/{bid}", headers=h)
    assert r2.status_code == 204
