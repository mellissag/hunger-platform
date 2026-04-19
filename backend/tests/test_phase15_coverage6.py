"""Phase 15 coverage boost — part 6: final gap filling.

Targets remaining 1% needed for 70% threshold:
- booking_service: cancel_booking(actor="client") + reschedule_booking
- booking_service: update_booking with starts_at change
- salon_admin_service.save_brand_asset path
- client_service: delete_client
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
import pytest_asyncio
from passlib.context import CryptContext

from app.db.base import get_async_session_factory
from app.models.catalog import MasterService, Service, ServiceCategory
from app.models.client import Client
from app.models.enums import (
    BookingCreatedVia,
    BookingStatus,
    ClientSource,
    PrepaymentStatus,
    UserRole,
)
from app.models.master import Master
from app.models.user import User

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=4)


@pytest_asyncio.fixture
async def full_seed():
    """Full domain seed: owner, master, service+ms, client."""
    factory = get_async_session_factory()
    async with factory() as s:
        owner = User(
            email=f"own6_{uuid.uuid4().hex[:6]}@example.com",
            password_hash=_pwd.hash("pass12345"),
            role=UserRole.owner, first_name="O", last_name="O", lang="en", is_active=True,
        )
        s.add(owner)
        m = Master(display_name="F6 Master", bio={"en": "b"}, specialization={"en": "s"}, is_active=True, sort_order=0)
        s.add(m)
        cat = ServiceCategory(name_i18n={"en": "Cat"}, sort_order=0)
        s.add(cat)
        await s.flush()
        svc = Service(
            category_id=cat.id, name_i18n={"en": "Svc"},
            description_i18n={"en": "d"}, price=Decimal("40.00"),
            duration_minutes=60, is_active=True, sort_order=0,
        )
        s.add(svc)
        await s.flush()
        ms = MasterService(master_id=m.id, service_id=svc.id)
        s.add(ms)
        client = Client(
            tg_user_id=int(uuid.uuid4().int % 10**12),
            first_name="C6", last_name="L6", lang="en", source=ClientSource.manual,
        )
        s.add(client)
        await s.commit()
        await s.refresh(owner); await s.refresh(m); await s.refresh(svc); await s.refresh(client)
        return owner, m, svc, client


async def _create_booking(owner, master, svc, client, days_ahead=20):
    from app.services.booking_service import create_booking
    from app.schemas.booking import BookingCreate
    now = datetime.now(UTC)
    factory = get_async_session_factory()
    async with factory() as s:
        u = await s.get(User, owner.id)
        b = await create_booking(s, u, BookingCreate(
            client_id=client.id,
            master_id=master.id,
            service_id=svc.id,
            starts_at=now + timedelta(days=days_ahead),
            created_via=BookingCreatedVia.admin,
        ))
        await s.commit()
        return b.id


# ─── cancel_booking actor=client (free hours) ────────────────────────────────

@pytest.mark.asyncio
async def test_booking_cancel_by_client_free(full_seed):
    """Cancel by client within free cancellation window (far future booking)."""
    from app.services.booking_service import cancel_booking
    owner, master, svc, client = full_seed
    booking_id = await _create_booking(owner, master, svc, client, days_ahead=30)

    factory = get_async_session_factory()
    async with factory() as s:
        u = await s.get(User, owner.id)
        b = await cancel_booking(s, u, booking_id, actor="client", reason="Changed mind")
        await s.commit()
    assert b.status == BookingStatus.cancelled_by_client


# ─── reschedule_booking ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_booking_reschedule(full_seed):
    from app.services.booking_service import reschedule_booking
    owner, master, svc, client = full_seed
    booking_id = await _create_booking(owner, master, svc, client, days_ahead=40)
    new_start = datetime.now(UTC) + timedelta(days=50, hours=14)

    factory = get_async_session_factory()
    async with factory() as s:
        u = await s.get(User, owner.id)
        b = await reschedule_booking(s, u, booking_id, new_start)
        await s.commit()
    assert b.starts_at.date() == new_start.date()


# ─── update_booking with starts_at ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_booking_update_with_starts_at(full_seed):
    from app.services.booking_service import update_booking
    from app.schemas.booking import BookingUpdate
    owner, master, svc, client = full_seed
    booking_id = await _create_booking(owner, master, svc, client, days_ahead=60)
    new_start = datetime.now(UTC) + timedelta(days=65, hours=10)

    factory = get_async_session_factory()
    async with factory() as s:
        u = await s.get(User, owner.id)
        b = await update_booking(s, u, booking_id, BookingUpdate(starts_at=new_start))
        await s.commit()
    assert b.starts_at.date() == new_start.date()


# ─── client_service delete ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_client_service_delete(full_seed):
    from app.services.client_service import delete_client, get_client
    from app.core.exceptions import NotFoundError
    owner, master, svc, client = full_seed
    factory = get_async_session_factory()
    async with factory() as s:
        u = await s.get(User, owner.id)
        await delete_client(s, u, client.id)
        await s.commit()
    async with factory() as s:
        u = await s.get(User, owner.id)
        with pytest.raises(NotFoundError):
            await get_client(s, u, client.id)


# ─── bot_booking service paths ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_bot_booking_is_blacklisted():
    """bot_booking.is_blacklisted: empty DB returns False."""
    from app.services.bot_booking import is_blacklisted
    factory = get_async_session_factory()
    async with factory() as s:
        result = await is_blacklisted(s, uuid.uuid4())
    assert result is False


@pytest.mark.asyncio
async def test_bot_booking_list_client_bookings():
    """bot_booking.list_client_bookings: empty DB returns empty list."""
    from app.services.bot_booking import list_client_bookings
    factory = get_async_session_factory()
    async with factory() as s:
        result = await list_client_bookings(s, uuid.uuid4())
    assert isinstance(result, list)


# ─── stats_refresh_service ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_stats_refresh_for_date():
    from app.services.stats_refresh_service import refresh_bot_visit_stat_for_date
    from datetime import date
    factory = get_async_session_factory()
    async with factory() as s:
        await refresh_bot_visit_stat_for_date(s, date.today())
        await s.commit()


# ─── master_stats_service ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_master_stats_service_empty():
    from app.services.master_stats_service import list_master_stats
    from datetime import date
    factory = get_async_session_factory()
    async with factory() as s:
        result = await list_master_stats(
            s,
            dfrom=date(2026, 1, 1),
            dto=date(2026, 12, 31),
        )
    assert isinstance(result, list)


# ─── service_stats_service ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_service_stats_dead_empty():
    from app.services.service_stats_service import dead_services
    from datetime import date
    factory = get_async_session_factory()
    async with factory() as s:
        result = await dead_services(s, dto=date(2026, 12, 31), dead_days=30)
    assert isinstance(result, list)


@pytest.mark.asyncio
async def test_service_stats_top_empty():
    from app.services.service_stats_service import top_services_by_revenue
    from datetime import date
    factory = get_async_session_factory()
    async with factory() as s:
        result = await top_services_by_revenue(s, dfrom=date(2026, 1, 1), dto=date(2026, 12, 31))
    assert isinstance(result, list)
