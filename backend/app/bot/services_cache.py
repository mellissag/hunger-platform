"""Кеш услуг + Redis Pub/Sub (01_MASTER_SPEC §7.8.5)."""

from __future__ import annotations

import asyncio
import json
from typing import Any

from loguru import logger
from redis.asyncio import Redis

CHANNEL = "services:updates"


async def subscribe_to_updates(redis: Redis) -> None:
    """Фоновая подписка на инвалидацию кеша (заготовка)."""

    async def _loop() -> None:
        try:
            async with redis.pubsub() as ps:
                await ps.subscribe(CHANNEL)
                async for msg in ps.listen():
                    if msg.get("type") != "message":
                        continue
                    try:
                        json.loads(msg.get("data") or b"{}")
                    except json.JSONDecodeError:
                        continue
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.warning("services_cache_subscribe_stopped: {}", e)

    asyncio.create_task(_loop())


def apply_pub_event(_event: dict[str, Any]) -> None:
    """Обновление in-memory кеша по событию (расширение в следующих итерациях)."""
    pass
