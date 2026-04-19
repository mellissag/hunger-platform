"""Фаза 7: rate limit, 503 без GEMINI, запрет записи через AI, respx."""

from __future__ import annotations

import uuid

import httpx
import pytest
import respx

from app.core.exceptions import AIRateLimitError
from app.models.enums import LateCancellationPolicy, ThemePreset
from app.models.salon import Salon, Settings
from app.services.ai_rate_limit import check_ai_rate_limit
from app.services.ai_service import NO_BOOKING_VIA_AI_INSTRUCTION, gemini_configured


@pytest.mark.asyncio
async def test_ai_rate_limit_redis_blocks_at_21() -> None:
    from app.db.base import get_async_session_factory

    calls = {"n": 0}

    class FakeRedis:
        async def incr(self, _key: str) -> int:
            calls["n"] += 1
            return calls["n"]

        async def expire(self, *_a, **_k) -> None:
            return None

    fake = FakeRedis()
    factory = get_async_session_factory()
    cid = uuid.uuid4()
    async with factory() as session:
        for _ in range(20):
            await check_ai_rate_limit(session, fake, cid)  # type: ignore[arg-type]
        await session.commit()

    async with factory() as session:
        with pytest.raises(AIRateLimitError):
            await check_ai_rate_limit(session, fake, cid)  # type: ignore[arg-type]


def test_no_booking_via_ai_instruction_constant() -> None:
    assert "NOT book appointments" in NO_BOOKING_VIA_AI_INSTRUCTION
    assert "Записаться" in NO_BOOKING_VIA_AI_INSTRUCTION


@pytest.mark.asyncio
async def test_test_chat_returns_503_without_gemini(
    client,
    test_user_owner,
    monkeypatch,
) -> None:
    from app.config import reset_settings_cache

    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    reset_settings_cache()
    assert not gemini_configured()

    from app.db.base import get_async_session_factory

    factory = get_async_session_factory()
    async with factory() as session:
        salon = Salon(
            name="S",
            description={},
            timezone="UTC",
            currency="EUR",
            default_lang="en",
        )
        session.add(salon)
        await session.flush()
        session.add(
            Settings(
                salon_id=salon.id,
                theme=ThemePreset.friendly,
                cancellation_free_hours=24,
                late_cancellation_policy=LateCancellationPolicy.no_cancel,
                ai_enabled=True,
            )
        )
        await session.commit()

    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "owner@example.com", "password": "secretpass12"},
        headers={"X-Test-Rate-Bucket": "ai-test-bucket"},
    )
    assert login.status_code == 200
    token = login.json()["access_token"]

    r = await client.post(
        "/api/v1/ai/test_chat",
        json={"question": "Hello"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 503
    assert r.json().get("code") == "ai_unavailable"


@pytest.mark.asyncio
async def test_respx_mocks_http() -> None:
    with respx.mock(assert_all_called=False) as respx_mock:
        respx_mock.get("https://example.invalid/ping").mock(
            return_value=httpx.Response(200, json={"ok": True})
        )
        async with httpx.AsyncClient() as ac:
            r = await ac.get("https://example.invalid/ping")
        assert r.json() == {"ok": True}

