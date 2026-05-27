"""Browser Mini App: per-guest client, not shared anonymous tg_user_id."""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from app.db.base import get_async_session_factory
from app.models.client import Client
from app.models.enums import ReferralRewardMode, ReferralTrigger
from app.models.loyalty import LoyaltySettings, ReferralCode


@pytest.mark.asyncio
async def test_register_guest_without_referral_has_zero_points(client: AsyncClient) -> None:
    factory = get_async_session_factory()
    async with factory() as session:
        session.add(
            LoyaltySettings(
                referral_enabled=True,
                referral_trigger=ReferralTrigger.on_registration,
                referral_reward_mode=ReferralRewardMode.both,
                referral_bonus_referrer=50,
                referral_bonus_invited=100,
            )
        )
        referrer = Client(tg_user_id=880001, first_name="Ref", lang="ru")
        session.add(referrer)
        await session.flush()
        session.add(ReferralCode(client_id=referrer.id, code="BROWSREF1"))
        await session.commit()

    reg = await client.post(
        "/api/v1/mini-app/register-guest",
        json={"first_name": "Browser User", "phone": "+359880000111", "lang": "ru"},
    )
    assert reg.status_code == 200, reg.text
    body = reg.json()
    assert body.get("client_id")
    assert body.get("onboarded") is True

    guest_id = body["client_id"]
    loyalty = await client.get(
        "/api/v1/me/loyalty",
        headers={"X-Guest-Client-Id": guest_id},
    )
    assert loyalty.status_code == 200, loyalty.text
    assert loyalty.json()["points"] == 0

    async with factory() as session:
        row = await session.get(Client, guest_id)
        assert row is not None
        assert row.referred_by_client_id is None
        assert row.loyalty_points == 0


@pytest.mark.asyncio
async def test_me_loyalty_without_auth_returns_401(client: AsyncClient) -> None:
    r = await client.get("/api/v1/me/loyalty")
    assert r.status_code == 401
