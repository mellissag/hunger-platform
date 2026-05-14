"""Enqueue WhatsApp-related ARQ jobs."""

from __future__ import annotations

import json
import logging
from uuid import UUID

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


async def enqueue_process_whatsapp_webhook(payload: dict) -> None:
    await _enqueue_named_job("process_whatsapp_webhook", json.dumps(payload))


async def enqueue_send_whatsapp_booking_reminder(booking_id: UUID) -> None:
    await _enqueue_named_job("send_whatsapp_booking_reminder", str(booking_id))


async def enqueue_whatsapp_booking_client_notice(
    booking_id: UUID, kind: str, reason: str = ""
) -> None:
    await _enqueue_named_job(
        "send_whatsapp_booking_client_notice",
        str(booking_id),
        kind,
        reason or "",
    )


async def enqueue_send_whatsapp_booking_confirmation(booking_id: UUID) -> None:
    await enqueue_whatsapp_booking_client_notice(booking_id, "confirmed", "")
