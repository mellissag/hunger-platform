"""Настройки процесса ARQ (cron + задачи)."""

from __future__ import annotations

from arq.connections import RedisSettings
from arq.cron import cron
from arq.worker import func

from app.config import get_settings
from app.db.base import get_async_session_factory
from app.workers.broadcasts import send_broadcast
from app.workers.indexer import index_kb_document
from app.workers.reminders import process_booking_reminders
from app.workers.stats_job import refresh_bot_visit_stats_yesterday


def _redis_settings() -> RedisSettings:
    url = get_settings().redis_url
    if not url:
        raise RuntimeError("REDIS_URL is required for the ARQ worker")
    return RedisSettings.from_dsn(url)


async def on_startup(ctx: dict) -> None:
    ctx["db"] = get_async_session_factory()


class WorkerSettings:
    redis_settings = _redis_settings()
    on_startup = on_startup
    functions = [
        func(send_broadcast, name="send_broadcast", timeout=300, max_tries=3),
        func(index_kb_document, name="index_kb_document", timeout=600, max_tries=3),
    ]
    cron_jobs = [
        cron(
            process_booking_reminders,
            minute=set(range(0, 60, 5)),
            timeout=120,
            max_tries=3,
        ),
        cron(
            refresh_bot_visit_stats_yesterday,
            hour={1},
            minute={15},
            timeout=300,
            max_tries=3,
        ),
    ]
    job_timeout = 120
    max_tries = 3
