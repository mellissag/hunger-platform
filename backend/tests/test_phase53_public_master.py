"""Phase 53: public master profile for Mini App."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_public_master_profile_not_found(client: AsyncClient) -> None:
    r = await client.get("/api/v1/public/masters/00000000-0000-4000-8000-000000000099")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_public_master_profile_shape(client: AsyncClient) -> None:
    r_list = await client.get("/api/v1/mini-app/masters")
    assert r_list.status_code == 200
    lst = r_list.json()
    if not lst:
        pytest.skip("no masters in seed")
    mid = lst[0]["id"]
    r = await client.get(f"/api/v1/public/masters/{mid}?lang=en")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == mid
    assert "display_name" in body
    assert isinstance(body["services"], list)
    assert isinstance(body["reviews"], list)
    assert "reviews_total" in body
    assert isinstance(body["certificates"], list)
    assert isinstance(body["portfolio_urls"], list)
    assert "description" in body
    assert "specialization" in body
