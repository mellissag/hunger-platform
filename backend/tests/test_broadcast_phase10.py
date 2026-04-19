"""E2E: превью сегмента, создание рассылки, запуск (scheduled)."""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient

from app.db.base import get_async_session_factory
from app.models.client import Client


async def _owner_headers(client: AsyncClient) -> dict[str, str]:
    r = await client.post(
        "/api/v1/auth/login",
        json={"email": "owner@example.com", "password": "secretpass12"},
        headers={"X-Test-Rate-Bucket": str(uuid.uuid4())},
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.mark.asyncio
async def test_segment_preview_and_broadcast_send(client: AsyncClient, test_user_owner) -> None:
    factory = get_async_session_factory()
    async with factory() as s:
        s.add(Client(tg_user_id=880_001, lang="en"))
        await s.commit()

    h = await _owner_headers(client)

    prev = await client.post(
        "/api/v1/segments/preview",
        json={
            "criteria": {
                "type": "all",
                "exclude_blacklist": True,
                "exclude_marketing_opt_out": True,
            }
        },
        headers=h,
    )
    assert prev.status_code == 200
    assert prev.json()["count"] >= 1

    create = await client.post(
        "/api/v1/broadcasts",
        json={
            "title": "Spring promo",
            "message_i18n": {"en": "Hello!", "ru": "", "uk": "", "bg": ""},
            "segment": {
                "type": "all",
                "exclude_blacklist": True,
                "exclude_marketing_opt_out": True,
            },
        },
        headers=h,
    )
    assert create.status_code == 200, create.text
    bid = create.json()["id"]

    send = await client.post(
        f"/api/v1/broadcasts/{bid}/send",
        json={"scheduled_at": None},
        headers=h,
    )
    assert send.status_code == 200, send.text
    assert send.json()["status"] == "scheduled"
    stats = send.json()["stats"]
    assert stats.get("total", 0) >= 1

    get_one = await client.get(f"/api/v1/broadcasts/{bid}", headers=h)
    assert get_one.status_code == 200
    assert get_one.json()["id"] == bid


@pytest.mark.asyncio
async def test_broadcast_draft_patch_delete(client: AsyncClient, test_user_owner) -> None:
    h = await _owner_headers(client)
    create = await client.post(
        "/api/v1/broadcasts",
        json={
            "title": "Draft",
            "message_i18n": {"en": "Hi", "ru": "", "uk": "", "bg": ""},
            "segment": {"type": "all", "exclude_blacklist": True, "exclude_marketing_opt_out": True},
        },
        headers=h,
    )
    assert create.status_code == 200
    bid = create.json()["id"]

    patch = await client.patch(
        f"/api/v1/broadcasts/{bid}",
        json={"title": "Draft 2"},
        headers=h,
    )
    assert patch.status_code == 200
    assert patch.json()["title"] == "Draft 2"

    delete = await client.delete(f"/api/v1/broadcasts/{bid}", headers=h)
    assert delete.status_code == 204


@pytest.mark.asyncio
async def test_reception_cannot_access_broadcasts(client: AsyncClient, test_user_master) -> None:
    r = await client.post(
        "/api/v1/auth/login",
        json={"email": "master@example.com", "password": "secretpass12"},
        headers={"X-Test-Rate-Bucket": str(uuid.uuid4())},
    )
    assert r.status_code == 200
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    res = await client.get("/api/v1/broadcasts", headers=h)
    assert res.status_code == 403
