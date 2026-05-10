"""Тесты Phase 13: Mini App, Review worker, Admin notify."""

from __future__ import annotations

import hashlib
import hmac
import json
import time
import urllib.parse
import uuid
from datetime import timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import status
from httpx import AsyncClient
from sqlalchemy import select

import app.core.clock as clock
from app.api.v1.mini_app import validate_init_data
from app.db.base import get_async_session_factory
from app.models.booking import Booking, Review
from app.models.catalog import MasterService, Service, ServiceCategory
from app.models.client import Client
from app.models.enums import BookingCreatedVia, BookingStatus
from app.models.master import Master
from app.models.salon import Settings
from app.workers.reviews import _run_review_session


# ─── Helpers ────────────────────────────────────────────────────────────────


def _make_init_data(token: str, user_id: int = 12345, first_name: str = "Test") -> str:
    user_json = json.dumps({"id": user_id, "first_name": first_name})
    auth_date = str(int(time.time()))
    raw = {"user": user_json, "auth_date": auth_date}
    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(raw.items()))
    secret_key = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    sig = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    return urllib.parse.urlencode({**raw, "hash": sig})


# ─── HMAC validation unit tests ───────────────────────────────────────────────


class TestInitDataValidation:
    def test_valid_init_data_accepted(self) -> None:
        token = "1234567890:AABBCCDDEE"
        raw = _make_init_data(token, user_id=42, first_name="Alice")
        result = validate_init_data(raw, token)
        assert result["user"]
        data = json.loads(result["user"])
        assert data["id"] == 42

    def test_invalid_hash_rejected(self) -> None:
        from fastapi import HTTPException

        token = "1234567890:AABBCCDDEE"
        raw = _make_init_data(token)
        tampered = raw + "x"  # corrupt hash
        with pytest.raises(HTTPException) as exc:
            validate_init_data(tampered, "wrong_token")
        assert exc.value.status_code == 401

    def test_missing_hash_rejected(self) -> None:
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc:
            validate_init_data("user=foo&auth_date=123", "anytoken")
        assert exc.value.status_code == 401


# ─── Mini App public API ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_mini_app_services_public(client: AsyncClient) -> None:
    """GET /api/v1/mini-app/services — public endpoint returns list."""
    r = await client.get("/api/v1/mini-app/services")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


@pytest.mark.asyncio
async def test_mini_app_masters_public(client: AsyncClient) -> None:
    """GET /api/v1/mini-app/masters — public endpoint returns list."""
    r = await client.get("/api/v1/mini-app/masters")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


@pytest.mark.asyncio
async def test_mini_app_booking_without_init_data(client: AsyncClient) -> None:
    """POST /api/v1/mini-app/bookings — without initData uses anonymous/JWT fallback (not 401)."""
    r = await client.post(
        "/api/v1/mini-app/bookings",
        json={"service_id": str(uuid.uuid4()), "master_id": str(uuid.uuid4()), "starts_at": "2026-05-10T14:00:00"},
    )
    assert r.status_code != status.HTTP_401_UNAUTHORIZED
    # Random UUIDs → usually 4xx; no longer 401 when initData is missing


# ─── Review worker tests ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_review_worker_sends_message(
    test_user_owner,
    test_master,
    test_service,
) -> None:
    """Worker sends review request for eligible completed bookings."""
    async with get_async_session_factory()() as db:
        # Create a client with tg_user_id
        client_obj = Client(
            tg_user_id=999_001,
            first_name="ReviewTest",
            lang="ru",
        )
        db.add(client_obj)
        await db.flush()

        # Create a completed booking that ended > 2 hours ago
        ended = clock.utc_now() - timedelta(hours=3)
        booking = Booking(
            client_id=client_obj.id,
            master_id=test_master.id,
            service_id=test_service.id,
            starts_at=ended - timedelta(hours=1),
            ends_at=ended,
            status=BookingStatus.completed,
            price=50,
            created_via=BookingCreatedVia.bot,
        )
        db.add(booking)
        await db.commit()
        await db.refresh(booking)

        mock_bot = MagicMock()
        mock_bot.id = 99
        mock_bot.send_message = AsyncMock(return_value=None)

        mock_dp = MagicMock()
        mock_dp.storage = AsyncMock()
        mock_dp.storage.set_state = AsyncMock()
        mock_dp.storage.set_data = AsyncMock()

        await _run_review_session(db, mock_bot, mock_dp)

        await db.refresh(booking)
        assert booking.review_sent is True
        mock_bot.send_message.assert_called_once()
        call_kwargs = mock_bot.send_message.call_args.kwargs
        assert call_kwargs["chat_id"] == 999_001


@pytest.mark.asyncio
async def test_review_worker_skips_already_sent(
    test_master,
    test_service,
) -> None:
    """Worker does not re-send if review_sent is already True."""
    async with get_async_session_factory()() as db:
        client_obj = Client(tg_user_id=999_002, first_name="Skip", lang="en")
        db.add(client_obj)
        await db.flush()

        ended = clock.utc_now() - timedelta(hours=3)
        booking = Booking(
            client_id=client_obj.id,
            master_id=test_master.id,
            service_id=test_service.id,
            starts_at=ended - timedelta(hours=1),
            ends_at=ended,
            status=BookingStatus.completed,
            price=50,
            created_via=BookingCreatedVia.bot,
            review_sent=True,
        )
        db.add(booking)
        await db.commit()

        mock_bot = MagicMock()
        mock_bot.send_message = AsyncMock()
        await _run_review_session(db, mock_bot, None)

        mock_bot.send_message.assert_not_called()


# ─── Admin notification service ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_notify_admin_skips_when_no_chat_id() -> None:
    from app.services.notification_service import AdminEvent, notify_admin

    mock_bot = AsyncMock()
    await notify_admin(mock_bot, admin_chat_id=None, event=AdminEvent.new_booking)
    mock_bot.send_message.assert_not_called()


@pytest.mark.asyncio
async def test_notify_admin_sends_message() -> None:
    from app.services.notification_service import AdminEvent, notify_admin

    mock_bot = MagicMock()
    mock_bot.send_message = AsyncMock()
    await notify_admin(
        mock_bot,
        admin_chat_id="-1001234567890",
        event=AdminEvent.new_booking,
        app_domain="example.com",
        client="Alice",
        master="Anna",
    )
    mock_bot.send_message.assert_called_once()
    call_kwargs = mock_bot.send_message.call_args.kwargs
    assert call_kwargs["chat_id"] == "-1001234567890"
    assert "new booking" in call_kwargs["text"].lower() or "new_booking" in call_kwargs["text"].lower()


# ─── Review flow: bot router ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_review_saved_and_master_rating_updated(
    test_master,
    test_service,
) -> None:
    """Review is saved and master rating_avg is recalculated."""
    async with get_async_session_factory()() as db:
        client_obj = Client(tg_user_id=999_003, first_name="Reviewer", lang="ru")
        db.add(client_obj)
        await db.flush()

        ended = clock.utc_now() - timedelta(hours=1)
        booking = Booking(
            client_id=client_obj.id,
            master_id=test_master.id,
            service_id=test_service.id,
            starts_at=ended - timedelta(hours=1),
            ends_at=ended,
            status=BookingStatus.completed,
            price=50,
            created_via=BookingCreatedVia.bot,
        )
        db.add(booking)
        await db.flush()

        review = Review(
            booking_id=booking.id,
            client_id=client_obj.id,
            master_id=test_master.id,
            rating=5,
            comment="Excellent!",
            source="bot",
            is_visible=True,
        )
        db.add(review)
        await db.flush()
        from app.services.master_phase20 import recalc_master_rating

        await recalc_master_rating(db, test_master.id)
        await db.commit()

        # Re-query master in same session to check updated fields
        from sqlalchemy import select as sa_select
        updated_master = (await db.execute(sa_select(Master).where(Master.id == test_master.id))).scalar_one()
        assert updated_master.rating_count >= 1
        assert updated_master.rating_avg is not None
        r = (await db.execute(select(Review).where(Review.booking_id == booking.id))).scalar_one_or_none()
        assert r is not None
        assert r.rating == 5
