"""Smoke tests — Phase 0."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_healthz(client: AsyncClient) -> None:
    response = await client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_api_hello(client: AsyncClient) -> None:
    response = await client.get("/api")
    assert response.status_code == 200
    assert response.json() == {"message": "hello"}
