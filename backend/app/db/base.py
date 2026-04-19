"""Async SQLAlchemy engine, session factory и DeclarativeBase."""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase


def _database_url() -> str:
    return os.environ["DATABASE_URL"]


class Base(DeclarativeBase):
    """Базовый класс ORM-моделей."""


_engine: AsyncEngine | None = None
_async_session_factory: async_sessionmaker[AsyncSession] | None = None


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        _engine = create_async_engine(
            _database_url(),
            echo=os.getenv("SQLALCHEMY_ECHO", "").lower() in ("1", "true", "yes"),
            pool_pre_ping=True,
        )
    return _engine


def get_async_session_factory() -> async_sessionmaker[AsyncSession]:
    global _async_session_factory
    if _async_session_factory is None:
        _async_session_factory = async_sessionmaker(
            get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False,
        )
    return _async_session_factory


@asynccontextmanager
async def get_session() -> AsyncIterator[AsyncSession]:
    """Контекстный менеджер сессии (скрипты, тесты)."""
    factory = get_async_session_factory()
    async with factory() as session:
        yield session


def reset_db_engine() -> None:
    """Сброс глобального engine (тесты, смена DATABASE_URL)."""
    global _engine, _async_session_factory
    if _engine is not None:
        # sync dispose is OK for async engine
        _engine.sync_engine.dispose()
    _engine = None
    _async_session_factory = None
