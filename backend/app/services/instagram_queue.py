"""Enqueue Instagram-related ARQ jobs."""

from __future__ import annotations

import json
import logging

from app.config import get_settings

logger = logging.getLogger(__name__)


async def _enqueue_named_job(job_name: str, *args: object) -> None:
    settings = get_settings()
    if not settings.redis_url:
        logger.warning("ARQ enqueue skipped (no REDIS_URL) job=%s", job_name)
        return
    from arq.connections import RedisSettings, create_pool

    pool = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    try:
        await pool.enqueue_job(job_name, *args)
    finally:
        await pool.close(close_connection_pool=True)


async def enqueue_process_instagram_webhook(payload: dict) -> None:
    await _enqueue_named_job("process_instagram_webhook", json.dumps(payload))
