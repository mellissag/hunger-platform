"""Phase 15 coverage boost — part 3.

Targets:
- booking_service: create, list, get, cancel, delete
- services_cache: apply_pub_event
- bot/keyboards pure builders
- API-level tests for additional coverage
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
import pytest_asyncio
from passlib.context import CryptContext

from app.db.base import get_async_session_factory
from app.models.booking import Booking
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


def _make_user(role=UserRole.owner, master_id=None) -> User:
    u = User(
        email=f"u_{uuid.uuid4().hex[:8]}@cov3.local",
        password_hash=_pwd.hash("pass12345"),
        role=role,
        first_name="T",
        last_name="U",
        lang="en",
        is_active=True,
    )
    if master_id is not None:
        u.master_id = master_id
    return u


@pytest_asyncio.fixture
async def booking_seed():
    """Returns (owner_user, master, service, client) with MasterService link."""
    factory = get_async_session_factory()
    async with factory() as s:
        owner = _make_user(UserRole.owner)
        s.add(owner)

        m = Master(
            display_name="Booking Master",
            bio={"en": "bio"},
            specialization={"en": "spec"},
            is_active=True,
            sort_order=0,
        )
        s.add(m)

        cat = ServiceCategory(
            name_i18n={"en": "Hair", "ru": "Волосы", "uk": "Волосся", "bg": "Коса"},
            sort_order=0,
        )
        s.add(cat)
        await s.flush()

        svc = Service(
            category_id=cat.id,
            name_i18n={"en": "Cut", "ru": "Стрижка", "uk": "Стрижка", "bg": "Подстр"},
            description_i18n={"en": "cut", "ru": "cut", "uk": "cut", "bg": "cut"},
            price=Decimal("40.00"),
            duration_minutes=60,
            is_active=True,
            sort_order=0,
        )
        s.add(svc)
        await s.flush()

        ms = MasterService(
            master_id=m.id,
            service_id=svc.id,
        )
        s.add(ms)

        client = Client(
            tg_user_id=int(uuid.uuid4().int % 10**12),
            first_name="Book",
            last_name="Client",
            lang="en",
            source=ClientSource.manual,
        )
        s.add(client)

        await s.commit()
        await s.refresh(owner)
        await s.refresh(m)
        await s.refresh(svc)
        await s.refresh(client)
        return owner, m, svc, client


# ─── booking_service: create ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_booking_create_basic(booking_seed):
    from app.services.booking_service import create_booking
    from app.schemas.booking import BookingCreate
    owner, master, svc, client = booking_seed
    now = datetime.now(UTC)
    starts = now + timedelta(days=2, hours=10)

    factory = get_async_session_factory()
    async with factory() as s:
        u = await s.get(User, owner.id)
        data = BookingCreate(
            client_id=client.id,
            master_id=master.id,
            service_id=svc.id,
            starts_at=starts,
            notes="Test booking",
            created_via=BookingCreatedVia.admin,
        )
        booking = await create_booking(s, u, data)
        await s.commit()

    assert booking.status == BookingStatus.confirmed
    assert booking.price == Decimal("40.00")


@pytest.mark.asyncio
async def test_booking_create_slot_conflict(booking_seed):
    """Creating a second booking at the same slot should raise SlotTakenError."""
    from app.services.booking_service import create_booking
    from app.schemas.booking import BookingCreate
    from app.core.exceptions import SlotTakenError
    owner, master, svc, client = booking_seed
    now = datetime.now(UTC)
    starts = now + timedelta(days=3, hours=11)

    factory = get_async_session_factory()
    async with factory() as s:
        u = await s.get(User, owner.id)
        data = BookingCreate(
            client_id=client.id, master_id=master.id, service_id=svc.id,
            starts_at=starts, created_via=BookingCreatedVia.admin,
        )
        await create_booking(s, u, data)
        await s.commit()

    async with factory() as s:
        u = await s.get(User, owner.id)
        data2 = BookingCreate(
            client_id=client.id, master_id=master.id, service_id=svc.id,
            starts_at=starts, created_via=BookingCreatedVia.admin,
        )
        with pytest.raises(SlotTakenError):
            await create_booking(s, u, data2)


@pytest.mark.asyncio
async def test_booking_create_service_not_offered(booking_seed):
    """Creating a booking where master doesn't offer the service should raise."""
    from app.services.booking_service import create_booking
    from app.schemas.booking import BookingCreate
    from app.core.exceptions import MasterDoesNotOfferServiceError
    owner, master, svc, client = booking_seed
    now = datetime.now(UTC)

    # Create a service not linked to the master
    factory = get_async_session_factory()
    async with factory() as s:
        cat = ServiceCategory(name_i18n={"en": "Other"}, sort_order=99)
        s.add(cat)
        await s.flush()
        other_svc = Service(
            category_id=cat.id,
            name_i18n={"en": "Perm"},
            description_i18n={"en": ""},
            price=Decimal("60.00"),
            duration_minutes=90,
            is_active=True,
            sort_order=0,
        )
        s.add(other_svc)
        await s.commit()
        other_svc_id = other_svc.id

    async with factory() as s:
        u = await s.get(User, owner.id)
        data = BookingCreate(
            client_id=client.id,
            master_id=master.id,
            service_id=other_svc_id,
            starts_at=now + timedelta(days=4, hours=9),
            created_via=BookingCreatedVia.admin,
        )
        with pytest.raises(MasterDoesNotOfferServiceError):
            await create_booking(s, u, data)


@pytest.mark.asyncio
async def test_booking_create_blacklisted_client(booking_seed):
    """Booking for blacklisted client should raise ClientBlacklistedError."""
    from app.models.booking import BlacklistEntry
    from app.services.booking_service import create_booking
    from app.schemas.booking import BookingCreate
    from app.core.exceptions import ClientBlacklistedError
    owner, master, svc, client = booking_seed
    now = datetime.now(UTC)

    factory = get_async_session_factory()
    async with factory() as s:
        bl = BlacklistEntry(
            client_id=client.id,
            reason="No show",
        )
        s.add(bl)
        await s.commit()

    async with factory() as s:
        u = await s.get(User, owner.id)
        data = BookingCreate(
            client_id=client.id,
            master_id=master.id,
            service_id=svc.id,
            starts_at=now + timedelta(days=5, hours=10),
            created_via=BookingCreatedVia.admin,
        )
        with pytest.raises(ClientBlacklistedError):
            await create_booking(s, u, data)


# ─── booking_service: list + get ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_booking_list_and_get(booking_seed):
    from app.services.booking_service import create_booking, get_booking, list_bookings
    from app.schemas.booking import BookingCreate
    owner, master, svc, client = booking_seed
    now = datetime.now(UTC)

    factory = get_async_session_factory()
    async with factory() as s:
        u = await s.get(User, owner.id)
        b = await create_booking(s, u, BookingCreate(
            client_id=client.id, master_id=master.id, service_id=svc.id,
            starts_at=now + timedelta(days=6), created_via=BookingCreatedVia.admin,
        ))
        await s.commit()
        b_id = b.id

    async with factory() as s:
        u = await s.get(User, owner.id)
        bookings, total = await list_bookings(s, u, q=None, page=1, page_size=20)
        assert total >= 1
        fetched = await get_booking(s, u, b_id)
        assert fetched.id == b_id


@pytest.mark.asyncio
async def test_booking_get_not_found(booking_seed):
    from app.services.booking_service import get_booking
    from app.core.exceptions import NotFoundError
    owner, master, svc, client = booking_seed
    factory = get_async_session_factory()
    async with factory() as s:
        u = await s.get(User, owner.id)
        with pytest.raises(NotFoundError):
            await get_booking(s, u, uuid.uuid4())


@pytest.mark.asyncio
async def test_booking_list_with_query(booking_seed):
    from app.services.booking_service import create_booking, list_bookings
    from app.schemas.booking import BookingCreate
    owner, master, svc, client = booking_seed
    now = datetime.now(UTC)
    factory = get_async_session_factory()
    async with factory() as s:
        u = await s.get(User, owner.id)
        await create_booking(s, u, BookingCreate(
            client_id=client.id, master_id=master.id, service_id=svc.id,
            starts_at=now + timedelta(days=7), notes="special note",
            created_via=BookingCreatedVia.admin,
        ))
        await s.commit()
    async with factory() as s:
        u = await s.get(User, owner.id)
        rows, total = await list_bookings(s, u, q="special", page=1, page_size=20)
    assert total >= 1
    async with factory() as s:
        u = await s.get(User, owner.id)
        rows2, total2 = await list_bookings(s, u, q="ZZZNO999", page=1, page_size=20)
    assert total2 == 0


# ─── booking_service: cancel ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_booking_cancel_by_salon(booking_seed):
    from app.services.booking_service import cancel_booking, create_booking
    from app.schemas.booking import BookingCreate
    owner, master, svc, client = booking_seed
    now = datetime.now(UTC)
    factory = get_async_session_factory()
    async with factory() as s:
        u = await s.get(User, owner.id)
        b = await create_booking(s, u, BookingCreate(
            client_id=client.id, master_id=master.id, service_id=svc.id,
            starts_at=now + timedelta(days=10, hours=2),
            created_via=BookingCreatedVia.admin,
        ))
        await s.commit()
        b_id = b.id

    async with factory() as s:
        u = await s.get(User, owner.id)
        cancelled = await cancel_booking(s, u, b_id, actor="user", reason="Schedule conflict")
        await s.commit()
    assert cancelled.status == BookingStatus.cancelled_by_salon


@pytest.mark.asyncio
async def test_booking_cancel_already_cancelled(booking_seed):
    """Cancelling an already-cancelled booking raises InvalidBookingStateError."""
    from app.services.booking_service import cancel_booking, create_booking
    from app.schemas.booking import BookingCreate
    from app.core.exceptions import InvalidBookingStateError
    owner, master, svc, client = booking_seed
    now = datetime.now(UTC)
    factory = get_async_session_factory()
    async with factory() as s:
        u = await s.get(User, owner.id)
        b = await create_booking(s, u, BookingCreate(
            client_id=client.id, master_id=master.id, service_id=svc.id,
            starts_at=now + timedelta(days=11),
            created_via=BookingCreatedVia.admin,
        ))
        await s.commit()
        b_id = b.id

    async with factory() as s:
        u = await s.get(User, owner.id)
        await cancel_booking(s, u, b_id, actor="user")
        await s.commit()

    async with factory() as s:
        u = await s.get(User, owner.id)
        with pytest.raises(InvalidBookingStateError):
            await cancel_booking(s, u, b_id, actor="user")


# ─── booking_service: delete ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_booking_delete(booking_seed):
    from app.services.booking_service import create_booking, delete_booking, get_booking
    from app.schemas.booking import BookingCreate
    from app.core.exceptions import NotFoundError
    owner, master, svc, client = booking_seed
    now = datetime.now(UTC)
    factory = get_async_session_factory()
    async with factory() as s:
        u = await s.get(User, owner.id)
        b = await create_booking(s, u, BookingCreate(
            client_id=client.id, master_id=master.id, service_id=svc.id,
            starts_at=now + timedelta(days=12),
            created_via=BookingCreatedVia.admin,
        ))
        await s.commit()
        b_id = b.id

    async with factory() as s:
        u = await s.get(User, owner.id)
        await delete_booking(s, u, b_id)
        await s.commit()

    async with factory() as s:
        u = await s.get(User, owner.id)
        with pytest.raises(NotFoundError):
            await get_booking(s, u, b_id)


# ─── services_cache ──────────────────────────────────────────────────────────

def test_services_cache_apply_pub_event_noop():
    """apply_pub_event should not raise for any event dict."""
    from app.bot.services_cache import apply_pub_event
    # Pass various event structures - should be a no-op
    apply_pub_event({})
    apply_pub_event({"action": "hide", "id": str(uuid.uuid4())})
    apply_pub_event({"action": "flush"})
    apply_pub_event({"action": "unknown", "data": "test"})


# ─── core/exceptions coverage ───────────────────────────────────────────────

def test_exceptions_not_found():
    from app.core.exceptions import NotFoundError
    e = NotFoundError("Resource not found")
    assert "not found" in str(e).lower()
    assert e.status_code == 404


def test_exceptions_conflict():
    from app.core.exceptions import ConflictError
    e = ConflictError("Already exists", code="duplicate")
    assert e.status_code == 409


def test_exceptions_forbidden():
    from app.core.exceptions import ForbiddenScopeError
    e = ForbiddenScopeError("No access")
    assert e.status_code == 403


def test_exceptions_slot_taken():
    from app.core.exceptions import SlotTakenError
    e = SlotTakenError()
    assert e.status_code in (400, 409, 422)


def test_exceptions_blacklisted():
    from app.core.exceptions import ClientBlacklistedError
    e = ClientBlacklistedError()
    assert e.status_code >= 400


def test_exceptions_invalid_state():
    from app.core.exceptions import InvalidBookingStateError
    e = InvalidBookingStateError("Not active")
    assert e.status_code >= 400


def test_exceptions_ai_rate_limit():
    from app.core.exceptions import AIRateLimitError
    e = AIRateLimitError()
    assert e.status_code == 429


# ─── booking stats service ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_booking_stats_service_overview(booking_seed):
    from app.services.booking_stats_service import get_booking_overview
    owner, master, svc, client = booking_seed
    factory = get_async_session_factory()
    from datetime import date
    async with factory() as s:
        today = date.today()
        result = await get_booking_overview(
            s,
            dfrom=today - timedelta(days=30),
            dto=today,
        )
    assert isinstance(result, dict)


@pytest.mark.asyncio
async def test_booking_stats_get_currency(booking_seed):
    from app.services.booking_stats_service import get_currency
    owner, master, svc, client = booking_seed
    factory = get_async_session_factory()
    async with factory() as s:
        currency = await get_currency(s)
    assert isinstance(currency, str)


# ─── segment_service extra paths ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_segment_service_all_clients():
    from app.services.segment_service import build_segment_ids
    from app.schemas.segment import SegmentCriteria
    factory = get_async_session_factory()
    async with factory() as s:
        ids = await build_segment_ids(s, SegmentCriteria(type="all"))
    assert isinstance(ids, list)


@pytest.mark.asyncio
async def test_segment_count_clients():
    from app.services.segment_service import count_segment_clients
    from app.schemas.segment import SegmentCriteria
    factory = get_async_session_factory()
    async with factory() as s:
        count = await count_segment_clients(s, SegmentCriteria(type="all"))
    assert isinstance(count, int)
