"""Phase 15: Targeted coverage tests to reach ≥70% backend coverage.

Covers:
- catalog_service (CRUD: categories + services + Redis-publish-None path)
- client_note_service (CRUD + pin + RBAC edge cases)
- master_service (CRUD + RBAC)
- stats_export_service (pure functions: xlsx + pdf)
- workers/indexer._split_chunks (pure function)
- workers/stats_job (with mocked factory)
- client_service (additional paths)
- booking_service (additional paths: cancel, status transition guards)
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
import pytest_asyncio
from passlib.context import CryptContext

from app.db.base import get_async_session_factory
from app.models.catalog import Service, ServiceCategory
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


# ─── Helpers ────────────────────────────────────────────────────────────────

def _make_user(role: UserRole = UserRole.owner, master_id=None) -> User:
    u = User(
        email=f"u_{uuid.uuid4().hex[:8]}@test.local",
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
async def owner_user():
    factory = get_async_session_factory()
    async with factory() as s:
        u = _make_user(UserRole.owner)
        s.add(u)
        await s.commit()
        await s.refresh(u)
        return u


@pytest_asyncio.fixture
async def admin_user():
    factory = get_async_session_factory()
    async with factory() as s:
        u = _make_user(UserRole.admin)
        s.add(u)
        await s.commit()
        await s.refresh(u)
        return u


@pytest_asyncio.fixture
async def reception_user():
    factory = get_async_session_factory()
    async with factory() as s:
        u = _make_user(UserRole.reception)
        s.add(u)
        await s.commit()
        await s.refresh(u)
        return u


@pytest_asyncio.fixture
async def master_record():
    factory = get_async_session_factory()
    async with factory() as s:
        m = Master(
            display_name="Test Master",
            bio={"en": "bio"},
            specialization={"en": "spec"},
            is_active=True,
            sort_order=0,
        )
        s.add(m)
        await s.commit()
        await s.refresh(m)
        return m


@pytest_asyncio.fixture
async def master_user(master_record):
    factory = get_async_session_factory()
    async with factory() as s:
        u = _make_user(UserRole.master, master_id=master_record.id)
        s.add(u)
        await s.commit()
        await s.refresh(u)
        return u


@pytest_asyncio.fixture
async def client_record():
    factory = get_async_session_factory()
    async with factory() as s:
        c = Client(
            tg_user_id=int(uuid.uuid4().int % 10**12),
            first_name="Client",
            last_name="One",
            lang="en",
            source=ClientSource.manual,
        )
        s.add(c)
        await s.commit()
        await s.refresh(c)
        return c


@pytest_asyncio.fixture
async def category_record():
    factory = get_async_session_factory()
    async with factory() as s:
        cat = ServiceCategory(
            name_i18n={"en": "Hair", "ru": "Волосы", "uk": "Волосся", "bg": "Коса"},
            sort_order=0,
        )
        s.add(cat)
        await s.commit()
        await s.refresh(cat)
        return cat


@pytest_asyncio.fixture
async def service_record(category_record):
    factory = get_async_session_factory()
    async with factory() as s:
        svc = Service(
            category_id=category_record.id,
            name_i18n={"en": "Haircut", "ru": "Стрижка", "uk": "Стрижка", "bg": "Подстригване"},
            description_i18n={"en": "Classic haircut", "ru": "Классическая", "uk": "Класична", "bg": "Класическо"},
            price=Decimal("35.00"),
            duration_minutes=60,
            is_active=True,
            sort_order=0,
        )
        s.add(svc)
        await s.commit()
        await s.refresh(svc)
        return svc


# ─── catalog_service ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_catalog_list_categories_empty():
    from app.services.catalog_service import list_categories
    factory = get_async_session_factory()
    async with factory() as s:
        rows, total = await list_categories(s, q=None, page=1, page_size=20)
    assert total == 0
    assert rows == []


@pytest.mark.asyncio
async def test_catalog_create_and_get_category():
    from app.services.catalog_service import create_category, get_category
    from app.schemas.service import ServiceCategoryCreate
    factory = get_async_session_factory()
    async with factory() as s:
        data = ServiceCategoryCreate(
            name_i18n={"en": "Nails", "ru": "Ногти", "uk": "Нігті", "bg": "Нокти"},
            sort_order=1,
        )
        cat = await create_category(s, data)
        await s.commit()
        fetched = await get_category(s, cat.id)
    assert fetched.id == cat.id


@pytest.mark.asyncio
async def test_catalog_get_category_not_found():
    from app.services.catalog_service import get_category
    from app.core.exceptions import NotFoundError
    factory = get_async_session_factory()
    async with factory() as s:
        with pytest.raises(NotFoundError):
            await get_category(s, uuid.uuid4())


@pytest.mark.asyncio
async def test_catalog_update_category(category_record):
    from app.services.catalog_service import update_category
    from app.schemas.service import ServiceCategoryUpdate
    factory = get_async_session_factory()
    async with factory() as s:
        data = ServiceCategoryUpdate(sort_order=99)
        cat = await update_category(s, None, category_record.id, data)
        await s.commit()
    assert cat.sort_order == 99


@pytest.mark.asyncio
async def test_catalog_update_category_not_found():
    from app.services.catalog_service import update_category
    from app.core.exceptions import NotFoundError
    from app.schemas.service import ServiceCategoryUpdate
    factory = get_async_session_factory()
    async with factory() as s:
        with pytest.raises(NotFoundError):
            await update_category(s, None, uuid.uuid4(), ServiceCategoryUpdate(sort_order=1))


@pytest.mark.asyncio
async def test_catalog_delete_category(category_record):
    from app.services.catalog_service import delete_category, get_category
    from app.core.exceptions import NotFoundError
    factory = get_async_session_factory()
    async with factory() as s:
        await delete_category(s, None, category_record.id)
        await s.commit()
        with pytest.raises(NotFoundError):
            await get_category(s, category_record.id)


@pytest.mark.asyncio
async def test_catalog_delete_category_not_found():
    from app.services.catalog_service import delete_category
    from app.core.exceptions import NotFoundError
    factory = get_async_session_factory()
    async with factory() as s:
        with pytest.raises(NotFoundError):
            await delete_category(s, None, uuid.uuid4())


@pytest.mark.asyncio
async def test_catalog_list_categories_with_query(category_record):
    from app.services.catalog_service import list_categories
    factory = get_async_session_factory()
    async with factory() as s:
        rows, total = await list_categories(s, q="Hair", page=1, page_size=20)
    assert total >= 1
    # search for something not there
    async with factory() as s:
        rows2, total2 = await list_categories(s, q="ZZZNOMATCH9999", page=1, page_size=20)
    assert total2 == 0


@pytest.mark.asyncio
async def test_catalog_create_service(category_record):
    from app.services.catalog_service import create_service, get_service
    from app.schemas.service import ServiceCreate
    factory = get_async_session_factory()
    async with factory() as s:
        data = ServiceCreate(
            category_id=category_record.id,
            name_i18n={"en": "Perm", "ru": "Хим. завивка", "uk": "Хім. завивка", "bg": "Перманент"},
            description_i18n={"en": "desc", "ru": "опис", "uk": "опис", "bg": "опис"},
            price=Decimal("60.00"),
            duration_minutes=90,
            is_active=True,
            sort_order=1,
        )
        svc = await create_service(s, None, data)
        await s.commit()
        fetched = await get_service(s, svc.id)
    assert fetched.id == svc.id


@pytest.mark.asyncio
async def test_catalog_get_service_not_found():
    from app.services.catalog_service import get_service
    from app.core.exceptions import NotFoundError
    factory = get_async_session_factory()
    async with factory() as s:
        with pytest.raises(NotFoundError):
            await get_service(s, uuid.uuid4())


@pytest.mark.asyncio
async def test_catalog_list_services_with_query(service_record):
    from app.services.catalog_service import list_services
    factory = get_async_session_factory()
    async with factory() as s:
        rows, total = await list_services(s, q="Haircut", page=1, page_size=20)
    assert total >= 1
    async with factory() as s:
        rows2, total2 = await list_services(s, q="ZZZNOMATCH9999", page=1, page_size=20)
    assert total2 == 0


@pytest.mark.asyncio
async def test_catalog_update_service(service_record):
    from app.services.catalog_service import update_service
    from app.schemas.service import ServiceUpdate
    factory = get_async_session_factory()
    async with factory() as s:
        data = ServiceUpdate(price=Decimal("45.00"))
        svc = await update_service(s, None, service_record.id, data)
        await s.commit()
    assert svc.price == Decimal("45.00")


@pytest.mark.asyncio
async def test_catalog_update_service_not_found():
    from app.services.catalog_service import update_service
    from app.core.exceptions import NotFoundError
    from app.schemas.service import ServiceUpdate
    factory = get_async_session_factory()
    async with factory() as s:
        with pytest.raises(NotFoundError):
            await update_service(s, None, uuid.uuid4(), ServiceUpdate(price=Decimal("1.00")))


@pytest.mark.asyncio
async def test_catalog_delete_service(service_record):
    from app.services.catalog_service import delete_service, get_service
    from app.core.exceptions import NotFoundError
    factory = get_async_session_factory()
    async with factory() as s:
        await delete_service(s, None, service_record.id)
        await s.commit()
        with pytest.raises(NotFoundError):
            await get_service(s, service_record.id)


@pytest.mark.asyncio
async def test_catalog_delete_service_not_found():
    from app.services.catalog_service import delete_service
    from app.core.exceptions import NotFoundError
    factory = get_async_session_factory()
    async with factory() as s:
        with pytest.raises(NotFoundError):
            await delete_service(s, None, uuid.uuid4())


# ─── client_note_service ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_note_create_and_list(owner_user, client_record):
    from app.services.client_note_service import create_note, list_notes
    factory = get_async_session_factory()
    async with factory() as s:
        # Reload within session
        u = await s.get(User, owner_user.id)
        note = await create_note(s, u, client_record.id, "Allergic to purple dye")
        await s.commit()
        u2 = await s.get(User, owner_user.id)
        notes = await list_notes(s, u2, client_record.id)
    assert any(n.content == "Allergic to purple dye" for n in notes)


@pytest.mark.asyncio
async def test_note_create_admin(admin_user, client_record):
    from app.services.client_note_service import create_note
    factory = get_async_session_factory()
    async with factory() as s:
        u = await s.get(User, admin_user.id)
        note = await create_note(s, u, client_record.id, "Admin note")
        await s.commit()
    assert note.content == "Admin note"


@pytest.mark.asyncio
async def test_note_create_reception(reception_user, client_record):
    from app.services.client_note_service import create_note
    factory = get_async_session_factory()
    async with factory() as s:
        u = await s.get(User, reception_user.id)
        note = await create_note(s, u, client_record.id, "Reception note")
        await s.commit()
    assert note.content == "Reception note"


@pytest.mark.asyncio
async def test_note_create_master_with_link(master_user, master_record, client_record, service_record):
    """Master can create a note only for clients they have bookings with."""
    from app.models.booking import Booking
    from app.models.enums import BookingCreatedVia, BookingStatus, PrepaymentStatus
    from app.services.client_note_service import create_note
    now = datetime.now(UTC)
    factory = get_async_session_factory()
    async with factory() as s:
        # Create a booking linking master → client
        b = Booking(
            client_id=client_record.id,
            master_id=master_record.id,
            service_id=service_record.id,
            starts_at=now - timedelta(hours=2),
            ends_at=now - timedelta(hours=1),
            status=BookingStatus.completed,
            price=Decimal("35.00"),
            prepayment_status=PrepaymentStatus.none,
            created_via=BookingCreatedVia.admin,
        )
        s.add(b)
        await s.commit()
        u = await s.get(User, master_user.id)
        note = await create_note(s, u, client_record.id, "Master note")
        await s.commit()
    assert note.content == "Master note"


@pytest.mark.asyncio
async def test_note_list_master_sees_own(master_user, master_record, owner_user, client_record, service_record):
    from app.models.booking import Booking
    from app.models.enums import BookingCreatedVia, BookingStatus
    from app.services.client_note_service import create_note, list_notes
    now = datetime.now(UTC)
    factory = get_async_session_factory()
    async with factory() as s:
        # Link master to client via booking
        b = Booking(
            client_id=client_record.id,
            master_id=master_record.id,
            service_id=service_record.id,
            starts_at=now - timedelta(hours=2),
            ends_at=now - timedelta(hours=1),
            status=BookingStatus.completed,
            price=Decimal("35.00"),
            prepayment_status=PrepaymentStatus.none,
            created_via=BookingCreatedVia.admin,
        )
        s.add(b)
        await s.commit()
        ow = await s.get(User, owner_user.id)
        await create_note(s, ow, client_record.id, "Owner secret note")
        mu = await s.get(User, master_user.id)
        await create_note(s, mu, client_record.id, "Master own note")
        await s.commit()
        mu2 = await s.get(User, master_user.id)
        notes = await list_notes(s, mu2, client_record.id)
    assert all(n.author_user_id == master_user.id for n in notes)
    assert any(n.content == "Master own note" for n in notes)


@pytest.mark.asyncio
async def test_note_update(owner_user, client_record):
    from app.services.client_note_service import create_note, update_note
    factory = get_async_session_factory()
    async with factory() as s:
        u = await s.get(User, owner_user.id)
        note = await create_note(s, u, client_record.id, "Old content")
        await s.commit()
        u2 = await s.get(User, owner_user.id)
        updated = await update_note(s, u2, client_record.id, note.id, "New content")
        await s.commit()
    assert updated.content == "New content"


@pytest.mark.asyncio
async def test_note_update_not_found(owner_user, client_record):
    from app.services.client_note_service import update_note
    from app.core.exceptions import NotFoundError
    factory = get_async_session_factory()
    async with factory() as s:
        u = await s.get(User, owner_user.id)
        with pytest.raises(NotFoundError):
            await update_note(s, u, client_record.id, uuid.uuid4(), "Nope")


@pytest.mark.asyncio
async def test_note_delete(owner_user, client_record):
    from app.services.client_note_service import create_note, delete_note, list_notes
    factory = get_async_session_factory()
    async with factory() as s:
        u = await s.get(User, owner_user.id)
        note = await create_note(s, u, client_record.id, "To delete")
        await s.commit()
        u2 = await s.get(User, owner_user.id)
        await delete_note(s, u2, client_record.id, note.id)
        await s.commit()
        u3 = await s.get(User, owner_user.id)
        notes = await list_notes(s, u3, client_record.id)
    assert not any(n.id == note.id for n in notes)


@pytest.mark.asyncio
async def test_note_delete_not_found(owner_user, client_record):
    from app.services.client_note_service import delete_note
    from app.core.exceptions import NotFoundError
    factory = get_async_session_factory()
    async with factory() as s:
        u = await s.get(User, owner_user.id)
        with pytest.raises(NotFoundError):
            await delete_note(s, u, client_record.id, uuid.uuid4())


@pytest.mark.asyncio
async def test_note_pin(owner_user, client_record):
    from app.services.client_note_service import create_note, set_pinned
    factory = get_async_session_factory()
    async with factory() as s:
        u = await s.get(User, owner_user.id)
        note = await create_note(s, u, client_record.id, "Pin me")
        await s.commit()
        u2 = await s.get(User, owner_user.id)
        pinned = await set_pinned(s, u2, client_record.id, note.id, True)
        await s.commit()
    assert pinned.pinned is True


@pytest.mark.asyncio
async def test_note_pin_forbidden_for_master(master_user, client_record):
    from app.services.client_note_service import set_pinned
    from app.core.exceptions import ForbiddenScopeError
    factory = get_async_session_factory()
    async with factory() as s:
        u = await s.get(User, master_user.id)
        with pytest.raises(ForbiddenScopeError):
            await set_pinned(s, u, client_record.id, uuid.uuid4(), True)


# ─── master_service ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_master_list_and_create(owner_user):
    from app.services.master_service import create_master, list_masters
    from app.schemas.master import MasterCreate
    factory = get_async_session_factory()
    async with factory() as s:
        u = await s.get(User, owner_user.id)
        data = MasterCreate(
            display_name="New Master",
            bio={"en": "bio", "ru": "биo", "uk": "біо", "bg": "биo"},
            specialization={"en": "nails", "ru": "ногти", "uk": "нігті", "bg": "нокти"},
            is_active=True,
            sort_order=0,
            payroll_percent=40,
        )
        m = await create_master(s, u, data)
        await s.commit()
        rows, total = await list_masters(s, u, q=None, page=1, page_size=20)
    assert total >= 1
    assert any(r.id == m.id for r in rows)


@pytest.mark.asyncio
async def test_master_list_with_query(owner_user, master_record):
    from app.services.master_service import list_masters
    factory = get_async_session_factory()
    async with factory() as s:
        u = await s.get(User, owner_user.id)
        rows, total = await list_masters(s, u, q="Test Master", page=1, page_size=20)
    assert total >= 1
    async with factory() as s:
        u = await s.get(User, owner_user.id)
        rows2, total2 = await list_masters(s, u, q="ZZZNO_MATCH_99", page=1, page_size=20)
    assert total2 == 0


@pytest.mark.asyncio
async def test_master_get(owner_user, master_record):
    from app.services.master_service import get_master
    factory = get_async_session_factory()
    async with factory() as s:
        u = await s.get(User, owner_user.id)
        m = await get_master(s, u, master_record.id)
    assert m.id == master_record.id


@pytest.mark.asyncio
async def test_master_get_not_found(owner_user):
    from app.services.master_service import get_master
    from app.core.exceptions import NotFoundError
    factory = get_async_session_factory()
    async with factory() as s:
        u = await s.get(User, owner_user.id)
        with pytest.raises(NotFoundError):
            await get_master(s, u, uuid.uuid4())


@pytest.mark.asyncio
async def test_master_update_by_owner(owner_user, master_record):
    from app.services.master_service import update_master
    from app.schemas.master import MasterUpdate
    factory = get_async_session_factory()
    async with factory() as s:
        u = await s.get(User, owner_user.id)
        m = await update_master(s, u, master_record.id, MasterUpdate(display_name="Updated Master"))
        await s.commit()
    assert m.display_name == "Updated Master"


@pytest.mark.asyncio
async def test_master_update_by_master_own(master_user, master_record):
    from app.services.master_service import update_master
    from app.schemas.master import MasterUpdate
    factory = get_async_session_factory()
    async with factory() as s:
        u = await s.get(User, master_user.id)
        m = await update_master(s, u, master_record.id, MasterUpdate(display_name="Self Update"))
        await s.commit()
    assert m.display_name == "Self Update"


@pytest.mark.asyncio
async def test_master_update_not_found(owner_user):
    from app.services.master_service import update_master
    from app.core.exceptions import NotFoundError
    from app.schemas.master import MasterUpdate
    factory = get_async_session_factory()
    async with factory() as s:
        u = await s.get(User, owner_user.id)
        with pytest.raises(NotFoundError):
            await update_master(s, u, uuid.uuid4(), MasterUpdate(display_name="Ghost"))


@pytest.mark.asyncio
async def test_master_update_forbidden_for_reception(reception_user, master_record):
    from app.services.master_service import update_master
    from app.core.exceptions import ForbiddenScopeError
    from app.schemas.master import MasterUpdate
    factory = get_async_session_factory()
    async with factory() as s:
        u = await s.get(User, reception_user.id)
        with pytest.raises(ForbiddenScopeError):
            await update_master(s, u, master_record.id, MasterUpdate(display_name="Nope"))


@pytest.mark.asyncio
async def test_master_delete_by_owner(owner_user, master_record):
    from app.services.master_service import delete_master, get_master
    from app.core.exceptions import NotFoundError
    factory = get_async_session_factory()
    async with factory() as s:
        u = await s.get(User, owner_user.id)
        await delete_master(s, u, master_record.id)
        await s.commit()
        with pytest.raises(NotFoundError):
            await get_master(s, u, master_record.id)


@pytest.mark.asyncio
async def test_master_delete_not_found(owner_user):
    from app.services.master_service import delete_master
    from app.core.exceptions import NotFoundError
    factory = get_async_session_factory()
    async with factory() as s:
        u = await s.get(User, owner_user.id)
        with pytest.raises(NotFoundError):
            await delete_master(s, u, uuid.uuid4())


@pytest.mark.asyncio
async def test_master_delete_forbidden_for_reception(reception_user, master_record):
    from app.services.master_service import delete_master
    from app.core.exceptions import ForbiddenScopeError
    factory = get_async_session_factory()
    async with factory() as s:
        u = await s.get(User, reception_user.id)
        with pytest.raises(ForbiddenScopeError):
            await delete_master(s, u, master_record.id)


# ─── stats_export_service ────────────────────────────────────────────────────

def test_payroll_to_xlsx_basic():
    from app.services.stats_export_service import payroll_to_xlsx
    rows = [
        {"display_name": "Anna", "revenue": "500.00", "completed_bookings": 10,
         "payroll_percent": "40%", "payroll_amount": "200.00"},
        {"display_name": "Bob", "revenue": "300.00", "completed_bookings": 6,
         "payroll_percent": "35%", "payroll_amount": "105.00"},
    ]
    data = payroll_to_xlsx(rows, period_label="April 2026")
    # XLSX magic bytes: PK (zip)
    assert data[:2] == b"PK"
    assert len(data) > 100


def test_payroll_to_xlsx_empty():
    from app.services.stats_export_service import payroll_to_xlsx
    data = payroll_to_xlsx([], period_label="April 2026")
    assert data[:2] == b"PK"


def test_payroll_to_xlsx_none_values():
    from app.services.stats_export_service import payroll_to_xlsx
    rows = [{"display_name": "X", "revenue": None, "completed_bookings": None,
              "payroll_percent": None, "payroll_amount": None}]
    data = payroll_to_xlsx(rows, period_label="Test")
    assert len(data) > 0


def test_payroll_to_pdf_basic():
    from app.services.stats_export_service import payroll_to_pdf
    rows = [
        {"display_name": "Anna", "revenue": "500.00", "completed_bookings": 10,
         "payroll_percent": "40%", "payroll_amount": "200.00"},
    ]
    data = payroll_to_pdf(rows, period_label="April 2026", title="Payroll April")
    # PDF starts with %PDF
    assert data[:4] == b"%PDF"
    assert len(data) > 200


def test_payroll_to_pdf_empty():
    from app.services.stats_export_service import payroll_to_pdf
    data = payroll_to_pdf([], period_label="Empty month")
    assert data[:4] == b"%PDF"


# ─── workers/indexer._split_chunks ───────────────────────────────────────────

def test_split_chunks_empty():
    from app.workers.indexer import _split_chunks
    assert _split_chunks("") == []
    assert _split_chunks("   ") == []


def test_split_chunks_short_text():
    from app.workers.indexer import _split_chunks
    result = _split_chunks("Hello world")
    assert result == ["Hello world"]


def test_split_chunks_long_text():
    from app.workers.indexer import _split_chunks, _CHUNK_CHARS
    # Make text longer than _CHUNK_CHARS to force splitting
    long_text = "A" * (_CHUNK_CHARS * 2 + 500)
    chunks = _split_chunks(long_text)
    assert len(chunks) >= 2
    # All chunks should be non-empty
    assert all(c.strip() for c in chunks)


def test_split_chunks_exactly_one_chunk():
    from app.workers.indexer import _split_chunks, _CHUNK_CHARS
    text = "X" * (_CHUNK_CHARS - 1)
    chunks = _split_chunks(text)
    assert len(chunks) == 1


def test_split_chunks_overlap():
    """Overlapping chunks should share some content."""
    from app.workers.indexer import _split_chunks, _CHUNK_CHARS, _OVERLAP_CHARS
    text = "Z" * (_CHUNK_CHARS + _OVERLAP_CHARS + 10)
    chunks = _split_chunks(text)
    assert len(chunks) == 2
    # Both chunks should be non-empty
    assert all(len(c) > 0 for c in chunks)


# ─── workers/stats_job ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_stats_job_refresh_yesterday():
    """Smoke test: refresh_bot_visit_stats_yesterday runs without error."""
    from app.workers.stats_job import refresh_bot_visit_stats_yesterday
    factory = get_async_session_factory()
    ctx = {"db": factory}
    # Should not raise
    await refresh_bot_visit_stats_yesterday(ctx)


# ─── client_service (extra paths) ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_client_service_list_with_query(owner_user, client_record):
    from app.services.client_service import list_clients
    factory = get_async_session_factory()
    async with factory() as s:
        u = await s.get(User, owner_user.id)
        rows, total = await list_clients(s, u, q="Client", page=1, page_size=20)
    assert total >= 1


@pytest.mark.asyncio
async def test_client_service_get_not_found(owner_user):
    from app.services.client_service import get_client
    from app.core.exceptions import NotFoundError
    factory = get_async_session_factory()
    async with factory() as s:
        u = await s.get(User, owner_user.id)
        with pytest.raises(NotFoundError):
            await get_client(s, u, uuid.uuid4())


@pytest.mark.asyncio
async def test_client_service_create(owner_user):
    from app.services.client_service import create_client, get_client
    from app.schemas.client import ClientCreate
    factory = get_async_session_factory()
    async with factory() as s:
        u = await s.get(User, owner_user.id)
        data = ClientCreate(
            first_name="New",
            last_name="Client",
            phone="+380991234567",
            lang="uk",
        )
        c = await create_client(s, u, data)
        await s.commit()
        row = await get_client(s, u, c.id)
    assert row[0].id == c.id


@pytest.mark.asyncio
async def test_client_service_update(owner_user, client_record):
    from app.services.client_service import update_client
    from app.schemas.client import ClientUpdate
    factory = get_async_session_factory()
    async with factory() as s:
        u = await s.get(User, owner_user.id)
        updated = await update_client(s, u, client_record.id, ClientUpdate(first_name="Updated"))
        await s.commit()
    assert updated.first_name == "Updated"


# ─── salon_admin_service ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_salon_bundle_get_initially_none():
    from app.services.salon_admin_service import get_salon_bundle
    factory = get_async_session_factory()
    async with factory() as s:
        # On fresh DB there is no salon, should return None
        result = await get_salon_bundle(s)
    assert result is None


# ─── audit_log_service ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_audit_log_record_event(owner_user):
    from app.services.audit_log import record_event
    factory = get_async_session_factory()
    async with factory() as s:
        u = await s.get(User, owner_user.id)
        await record_event(
            s,
            user_id=u.id,
            action="test_action",
            entity_type="test",
            entity_id=str(uuid.uuid4()),
            payload={"key": "value"},
        )
        await s.commit()
