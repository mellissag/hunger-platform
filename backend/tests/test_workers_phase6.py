"""Тесты ARQ workers: напоминания (идемпотентность), рассылка (429 / TelegramRetryAfter)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from aiogram.exceptions import TelegramRetryAfter
from sqlalchemy import select

from app.core import clock as clock_mod
from app.models.booking import Booking
from app.models.broadcast import Broadcast, BroadcastRecipient
from app.models.catalog import Service
from app.models.client import Client
from app.models.enums import (
    BookingStatus,
    BroadcastStatus,
    PrepaymentStatus,
    UserRole,
)
from app.models.master import Master
from app.models.salon import Salon, Settings
from app.models.user import User
from app.workers.broadcasts import send_broadcast
from app.workers.reminders import process_booking_reminders


@pytest.fixture
def fixed_time(monkeypatch):
    t = datetime(2026, 4, 15, 10, 0, 0, tzinfo=UTC)
    monkeypatch.setattr(clock_mod, "utc_now", lambda: t)
    return t


async def _seed_reminder_graph(session_factory, *, starts_at: datetime) -> None:
    """Минимальный граф: салон, клиент с tg, услуга, мастер, бронь confirmed."""
    async with session_factory() as session:
        salon = Salon(
            name="T",
            description={},
            timezone="UTC",
            currency="EUR",
            default_lang="en",
        )
        session.add(salon)
        await session.flush()
        settings = Settings(
            salon_id=salon.id,
            reminder_intervals=[24.0, 2.0, 0.5],
        )
        session.add(settings)

        master = Master(
            display_name="M",
            bio={},
            specialization={},
        )
        session.add(master)
        await session.flush()

        svc = Service(
            category_id=None,
            name_i18n={"en": "Manicure"},
            description_i18n={},
            duration_minutes=60,
            price=Decimal("40.00"),
        )
        session.add(svc)
        await session.flush()

        client = Client(
            tg_user_id=42424242,
            lang="en",
        )
        session.add(client)
        await session.flush()

        booking = Booking(
            client_id=client.id,
            master_id=master.id,
            service_id=svc.id,
            starts_at=starts_at,
            ends_at=starts_at + timedelta(hours=1),
            status=BookingStatus.confirmed,
            price=Decimal("40.00"),
            prepayment_status=PrepaymentStatus.none,
        )
        session.add(booking)
        await session.commit()


@pytest.mark.asyncio
async def test_reminder_sent_only_once(fixed_time, monkeypatch):
    from app.config import reset_settings_cache
    from app.db.base import get_async_session_factory

    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "fake-token-for-test")
    reset_settings_cache()

    factory = get_async_session_factory()
    starts = fixed_time + timedelta(hours=24)
    await _seed_reminder_graph(factory, starts_at=starts)

    send_mock = AsyncMock(return_value=None)
    bot_instance = MagicMock()
    bot_instance.send_message = send_mock
    bot_instance.session = AsyncMock()
    bot_instance.session.close = AsyncMock()

    ctx = {"db": factory}

    with patch("app.workers.reminders.Bot", return_value=bot_instance):
        await process_booking_reminders(ctx)
        await process_booking_reminders(ctx)

    assert send_mock.await_count == 1


@pytest.mark.asyncio
async def test_broadcast_retries_on_telegram_429(monkeypatch):
    from app.config import reset_settings_cache
    from app.db.base import get_async_session_factory

    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "fake-token-for-test")
    reset_settings_cache()

    factory = get_async_session_factory()

    async with factory() as session:
        user = User(
            email="owner@example.com",
            password_hash="x",
            role=UserRole.owner,
            first_name="O",
            last_name="O",
            lang="en",
            is_active=True,
        )
        session.add(user)
        await session.flush()

        bc = Broadcast(
            title="Hi",
            message_i18n={"en": "Hello"},
            media_url=None,
            created_by_user_id=user.id,
            status=BroadcastStatus.scheduled,
            stats={},
        )
        session.add(bc)
        await session.flush()

        cl = Client(tg_user_id=999001, lang="en")
        session.add(cl)
        await session.flush()

        session.add(
            BroadcastRecipient(
                broadcast_id=bc.id,
                client_id=cl.id,
            )
        )
        await session.commit()
        bid = bc.id

    calls = {"n": 0}

    class _DummyMethod:
        chat_id = 1

    async def send_message_side_effect(*_a, **_k):
        calls["n"] += 1
        if calls["n"] == 1:
            raise TelegramRetryAfter(_DummyMethod(), "flood", 0)
        return None

    bot_instance = MagicMock()
    bot_instance.send_message = AsyncMock(side_effect=send_message_side_effect)
    bot_instance.session = AsyncMock()
    bot_instance.session.close = AsyncMock()

    ctx = {"db": factory}

    with patch("app.workers.broadcasts.Bot", return_value=bot_instance):
        await send_broadcast(ctx, str(bid))

    assert calls["n"] == 2

    async with factory() as session:
        br = (
            await session.execute(select(BroadcastRecipient).where(BroadcastRecipient.broadcast_id == bid))
        ).scalar_one()
        assert br.sent_at is not None
