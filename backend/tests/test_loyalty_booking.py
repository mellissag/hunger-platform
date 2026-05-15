"""Лояльность при завершении/откате записи и автозавершение прошедших броней."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core import clock as clock_mod
from app.db.base import get_async_session_factory
from app.models.booking import Booking
from app.models.catalog import Service
from app.models.client import Client
from app.models.enums import BookingStatus, LoyaltyTransactionType, PrepaymentStatus
from app.models.loyalty import LoyaltyTransaction
from app.models.master import Master
from app.services import loyalty_service
from app.workers.auto_complete_bookings import auto_complete_past_bookings


async def _seed_booking(
    *,
    status: BookingStatus,
    ends_at: datetime,
    loyalty_points: int = 50,
    price: Decimal = Decimal("40.00"),
) -> tuple:
    factory = get_async_session_factory()
    async with factory() as session:
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
            price=price,
            loyalty_points=loyalty_points,
        )
        session.add(svc)
        await session.flush()

        client = Client(tg_user_id=42424243, lang="en")
        session.add(client)
        await session.flush()

        starts = ends_at - timedelta(hours=1)
        booking = Booking(
            client_id=client.id,
            master_id=master.id,
            service_id=svc.id,
            starts_at=starts,
            ends_at=ends_at,
            status=status,
            price=price,
            prepayment_status=PrepaymentStatus.none,
        )
        session.add(booking)
        await session.commit()
        return factory, client.id, booking.id, svc.id


@pytest.fixture
def fixed_time(monkeypatch):
    t = datetime(2026, 5, 15, 12, 0, 0, tzinfo=UTC)
    monkeypatch.setattr(clock_mod, "utc_now", lambda: t)
    return t


@pytest.mark.asyncio
async def test_on_booking_completed_then_reversed(fixed_time):
    ends = fixed_time - timedelta(hours=2)
    factory, client_id, booking_id, _ = await _seed_booking(
        status=BookingStatus.completed,
        ends_at=ends,
        loyalty_points=50,
    )

    async with factory() as session:
        booking = await session.get(Booking, booking_id)
        client = await session.get(Client, client_id)
        assert booking is not None and client is not None
        assert booking.points_earned == 0

        await loyalty_service.on_booking_completed(session, booking)
        await session.commit()

    async with factory() as session:
        booking = await session.get(Booking, booking_id)
        client = await session.get(Client, client_id)
        assert booking is not None and client is not None
        assert booking.points_earned == 50
        assert client.total_visits == 1
        assert client.loyalty_points == 50

        booking.status = BookingStatus.cancelled_by_salon
        await loyalty_service.on_booking_loyalty_reversed(session, booking)
        await session.commit()

    async with factory() as session:
        booking = await session.get(Booking, booking_id)
        client = await session.get(Client, client_id)
        txs = (
            await session.execute(
                select(LoyaltyTransaction).where(LoyaltyTransaction.booking_id == booking_id)
            )
        ).scalars().all()
        assert booking is not None and client is not None
        assert booking.points_earned == 0
        assert client.total_visits == 0
        assert client.loyalty_points == 0
        assert len(txs) == 2
        types = {tx.type for tx in txs}
        assert LoyaltyTransactionType.earned in types
        assert LoyaltyTransactionType.manual_adjustment in types
        assert sum(tx.points for tx in txs) == 0


@pytest.mark.asyncio
async def test_on_booking_loyalty_reversed_noop_without_settlement(fixed_time):
    ends = fixed_time - timedelta(hours=2)
    factory, client_id, booking_id, _ = await _seed_booking(
        status=BookingStatus.confirmed,
        ends_at=ends,
    )

    async with factory() as session:
        booking = await session.get(Booking, booking_id)
        client = await session.get(Client, client_id)
        assert booking is not None and client is not None
        visits_before = int(client.total_visits or 0)
        await loyalty_service.on_booking_loyalty_reversed(session, booking)
        await session.commit()

    async with factory() as session:
        client = await session.get(Client, client_id)
        txs = (
            await session.execute(
                select(LoyaltyTransaction).where(LoyaltyTransaction.booking_id == booking_id)
            )
        ).scalars().all()
        assert client is not None
        assert client.total_visits == visits_before
        assert txs == []


@pytest.mark.asyncio
async def test_auto_complete_past_bookings(fixed_time):
    ends = fixed_time - timedelta(minutes=30)
    factory, client_id, booking_id, _ = await _seed_booking(
        status=BookingStatus.confirmed,
        ends_at=ends,
        loyalty_points=30,
    )

    await auto_complete_past_bookings({"db": factory})

    async with factory() as session:
        booking = await session.get(Booking, booking_id)
        client = await session.get(Client, client_id)
        assert booking is not None and client is not None
        assert booking.status == BookingStatus.completed
        assert booking.points_earned == 30
        assert client.total_visits == 1
        assert client.loyalty_points == 30

    await auto_complete_past_bookings({"db": factory})

    async with factory() as session:
        booking = await session.get(Booking, booking_id)
        client = await session.get(Client, client_id)
        assert booking is not None and client is not None
        assert booking.points_earned == 30
        assert client.total_visits == 1
        assert client.loyalty_points == 30
