"""Pytest: БД (testcontainers или TEST_DATABASE_URL), клиент, фикстуры пользователей."""

from __future__ import annotations

import asyncio
import atexit
import os
import uuid

import pytest
import pytest_asyncio
from passlib.context import CryptContext
from sqlalchemy import text

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-key-32-bytes-min!!")
# Детерминированный /healthz без реального Telegram webhook
os.environ.pop("TELEGRAM_BOT_TOKEN", None)
os.environ.pop("TELEGRAM_WEBHOOK_SECRET", None)

# Запуск pytest на хосте: .env часто указывает на хост `postgres` (только из compose-сети).
if os.getenv("DATABASE_URL") and not os.path.exists("/.dockerenv"):
    dsn = os.environ["DATABASE_URL"]
    if "@postgres:" in dsn or "@postgres/" in dsn:
        os.environ.pop("DATABASE_URL", None)


def _normalize_asyncpg(url: str) -> str:
    if "+asyncpg" in url:
        return url
    if url.startswith("postgresql+psycopg2://"):
        return url.replace("postgresql+psycopg2://", "postgresql+asyncpg://", 1)
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


def _ensure_database_url() -> None:
    """TEST_DATABASE_URL > DATABASE_URL > testcontainers (Docker)."""
    if os.getenv("TEST_DATABASE_URL"):
        os.environ["DATABASE_URL"] = _normalize_asyncpg(os.environ["TEST_DATABASE_URL"])
        return
    if os.getenv("DATABASE_URL"):
        os.environ["DATABASE_URL"] = _normalize_asyncpg(os.environ["DATABASE_URL"])
        return

    from testcontainers.postgres import PostgresContainer

    pg = PostgresContainer("pgvector/pgvector:pg16")
    pg.start()
    os.environ["DATABASE_URL"] = _normalize_asyncpg(pg.get_connection_url())
    atexit.register(pg.stop)


_ensure_database_url()

import app.models  # noqa: E402, F401 — регистрация metadata
from app.db.base import Base, get_async_session_factory, get_engine, reset_db_engine  # noqa: E402


def _create_schema() -> None:
    reset_db_engine()

    async def _inner() -> None:
        engine = get_engine()
        async with engine.begin() as conn:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS citext"))
            await conn.run_sync(Base.metadata.create_all)
        await engine.dispose()

    asyncio.run(_inner())
    reset_db_engine()


_create_schema()


_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)


@pytest_asyncio.fixture(autouse=True)
async def _truncate_tables() -> None:
    # Новый event loop на каждый тест — пересоздаём engine, иначе asyncpg pool «прилипает» к закрытому loop.
    reset_db_engine()
    factory = get_async_session_factory()
    async with factory() as session:
        await session.execute(
            text(
                """
                TRUNCATE TABLE
                  ai_message,
                  ai_conversation,
                  bot_visit_stat,
                  broadcast_recipient,
                  broadcast,
                  kb_chunk,
                  kb_document,
                  review,
                  booking,
                  blacklist_entry,
                  client_note,
                  client,
                  master_service,
                  service,
                  service_category,
                  schedule_slot,
                  master,
                  settings,
                  salon,
                  user_invite,
                  audit_log,
                  session,
                  "user"
                RESTART IDENTITY CASCADE
                """
            )
        )
        await session.commit()
    yield


@pytest_asyncio.fixture
async def test_user_owner():
    """Создаёт пользователя owner@example.com / secretpass12."""
    from app.models.enums import UserRole
    from app.models.user import User

    factory = get_async_session_factory()
    async with factory() as session:
        u = User(
            email="owner@example.com",
            password_hash=_pwd.hash("secretpass12"),
            role=UserRole.owner,
            first_name="Test",
            last_name="Owner",
            lang="en",
            is_active=True,
        )
        session.add(u)
        await session.commit()
        await session.refresh(u)
        return u.id


@pytest_asyncio.fixture
async def test_user_master():
    """Создаёт master без master_id (достаточно для RBAC-теста)."""
    from app.models.enums import UserRole
    from app.models.user import User

    factory = get_async_session_factory()
    async with factory() as session:
        u = User(
            email="master@example.com",
            password_hash=_pwd.hash("secretpass12"),
            role=UserRole.master,
            first_name="M",
            last_name="M",
            lang="en",
            is_active=True,
        )
        session.add(u)
        await session.commit()
        await session.refresh(u)
        return u.id


@pytest_asyncio.fixture
async def client():
    """HTTP-клиент к приложению (тот же event loop, что и async SQLAlchemy)."""
    from httpx import ASGITransport, AsyncClient

    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def rate_bucket():
    return str(uuid.uuid4())


@pytest_asyncio.fixture
async def test_master():
    """Creates an active Master record for Phase 13 tests."""
    from app.models.master import Master

    factory = get_async_session_factory()
    async with factory() as session:
        m = Master(
            display_name="Test Master",
            bio={"en": "Test bio", "ru": "Тест"},
            specialization={"en": "Haircut", "ru": "Стрижка"},
            is_active=True,
            sort_order=0,
        )
        session.add(m)
        await session.commit()
        await session.refresh(m)
        return m


@pytest_asyncio.fixture
async def test_service():
    """Creates an active ServiceCategory and Service for Phase 13 tests."""
    from app.models.catalog import Service, ServiceCategory

    factory = get_async_session_factory()
    async with factory() as session:
        cat = ServiceCategory(
            name_i18n={"en": "Hair", "ru": "Волосы"},
            sort_order=0,
        )
        session.add(cat)
        await session.flush()
        svc = Service(
            category_id=cat.id,
            name_i18n={"en": "Haircut", "ru": "Стрижка"},
            description_i18n={"en": "Classic haircut", "ru": "Классическая стрижка"},
            price=35,
            duration_minutes=60,
            is_active=True,
            sort_order=0,
        )
        session.add(svc)
        await session.commit()
        await session.refresh(svc)
        return svc


@pytest.fixture
def fake_now(monkeypatch):
    """Фиксированное UTC-время для детерминизма (патчит `app.core.clock.utc_now`)."""
    from datetime import UTC, datetime

    import app.core.clock as clock_mod

    fixed = datetime(2026, 4, 15, 8, 0, 0, tzinfo=UTC)
    monkeypatch.setattr(clock_mod, "utc_now", lambda: fixed)
    return fixed
