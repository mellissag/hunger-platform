"""Реферальные бонусы: trigger on_registration vs on_first_visit."""

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
from app.models.enums import (
    BookingStatus,
    LoyaltyTransactionType,
    PrepaymentStatus,
    ReferralRewardMode,
    ReferralTrigger,
)
from app.models.loyalty import LoyaltySettings, LoyaltyTransaction, ReferralCode
from app.models.master import Master
from app.services import loyalty_service


@pytest.fixture
def fixed_time(monkeypatch):
    t = datetime(2026, 5, 15, 12, 0, 0, tzinfo=UTC)
    monkeypatch.setattr(clock_mod, "utc_now", lambda: t)
    return t


async def _seed_referral_pair(
    *,
    trigger: ReferralTrigger,
    invited_bonus: int = 100,
) -> tuple:
    factory = get_async_session_factory()
    async with factory() as session:
        settings = LoyaltySettings(
            referral_enabled=True,
            referral_trigger=trigger,
            referral_reward_mode=ReferralRewardMode.both,
            referral_bonus_referrer=50,
            referral_bonus_invited=invited_bonus,
        )
        session.add(settings)

        referrer = Client(tg_user_id=900001, first_name="Referrer", lang="ru")
        invited = Client(tg_user_id=900002, first_name="Invited", lang="ru")
        session.add_all([referrer, invited])
        await session.flush()

        session.add(ReferralCode(client_id=referrer.id, code="TESTREF1"))
        await session.commit()
        return factory, referrer.id, invited.id, "TESTREF1"


@pytest.mark.asyncio
async def test_registration_code_no_bonus_on_first_visit_trigger() -> None:
    factory, _referrer_id, invited_id, code = await _seed_referral_pair(
        trigger=ReferralTrigger.on_first_visit,
    )

    async with factory() as session:
        invited = await session.get(Client, invited_id)
        assert invited is not None
        await loyalty_service.process_registration_referral_code(session, invited, code)
        await session.commit()

    async with factory() as session:
        invited = await session.get(Client, invited_id)
        txs = (
            await session.execute(
                select(LoyaltyTransaction).where(
                    LoyaltyTransaction.client_id == invited_id
                )
            )
        ).scalars().all()
        assert invited is not None
        assert invited.referred_by_client_id is not None
        assert invited.loyalty_points == 0
        assert txs == []


@pytest.mark.asyncio
async def test_registration_code_bonus_on_registration_trigger() -> None:
    factory, referrer_id, invited_id, code = await _seed_referral_pair(
        trigger=ReferralTrigger.on_registration,
        invited_bonus=100,
    )

    async with factory() as session:
        invited = await session.get(Client, invited_id)
        assert invited is not None
        await loyalty_service.process_registration_referral_code(session, invited, code)
        await session.commit()

    async with factory() as session:
        invited = await session.get(Client, invited_id)
        referrer = await session.get(Client, referrer_id)
        assert invited is not None and referrer is not None
        assert invited.loyalty_points == 100
        assert referrer.loyalty_points == 50


@pytest.mark.asyncio
async def test_referral_bonus_on_first_completed_visit(fixed_time) -> None:
    factory, referrer_id, invited_id, code = await _seed_referral_pair(
        trigger=ReferralTrigger.on_first_visit,
        invited_bonus=100,
    )

    async with factory() as session:
        invited = await session.get(Client, invited_id)
        assert invited is not None
        await loyalty_service.process_registration_referral_code(session, invited, code)
        await session.commit()

    async with factory() as session:
        master = Master(display_name="M", bio={}, specialization={})
        session.add(master)
        await session.flush()
        svc = Service(
            category_id=None,
            name_i18n={"ru": "Услуга"},
            description_i18n={},
            duration_minutes=60,
            price=Decimal("40"),
            loyalty_points=10,
        )
        session.add(svc)
        await session.flush()
        ends = fixed_time - timedelta(hours=1)
        booking = Booking(
            client_id=invited_id,
            master_id=master.id,
            service_id=svc.id,
            starts_at=ends - timedelta(hours=1),
            ends_at=ends,
            status=BookingStatus.completed,
            price=Decimal("40"),
            prepayment_status=PrepaymentStatus.none,
        )
        session.add(booking)
        await session.commit()
        booking_id = booking.id

    async with factory() as session:
        booking = await session.get(Booking, booking_id)
        assert booking is not None
        await loyalty_service.on_booking_completed(session, booking)
        await session.commit()

    async with factory() as session:
        invited = await session.get(Client, invited_id)
        referrer = await session.get(Client, referrer_id)
        ref_txs = (
            await session.execute(
                select(LoyaltyTransaction).where(
                    LoyaltyTransaction.type == LoyaltyTransactionType.referral_bonus
                )
            )
        ).scalars().all()
        assert invited is not None and referrer is not None
        assert invited.total_visits == 1
        assert invited.loyalty_points == 110  # 10 earned + 100 referral
        assert referrer.loyalty_points == 50
        assert len(ref_txs) == 2
