"""Настройки процесса ARQ (cron + задачи)."""

from __future__ import annotations

from arq.connections import RedisSettings
from arq.cron import cron
from arq.worker import func

from app.config import get_settings
from app.db.base import get_async_session_factory
from app.workers.broadcasts import fire_post_visit_trigger, send_broadcast
from app.workers.indexer import index_kb_document
from app.workers.reminders import process_booking_reminders
from app.workers.reviews import run_review_sender
from app.workers.stats_job import refresh_bot_visit_stats_yesterday
from app.workers.whatsapp_tasks import (
    process_whatsapp_webhook,
    send_whatsapp_booking_client_notice,
    send_whatsapp_booking_confirmation,
    send_whatsapp_booking_reminder,
)


def _redis_settings() -> RedisSettings:
    url = get_settings().redis_url
    if not url:
        raise RuntimeError("REDIS_URL is required for the ARQ worker")
    return RedisSettings.from_dsn(url)


async def on_startup(ctx: dict) -> None:
    ctx["db"] = get_async_session_factory()
    # Inject bot + dispatcher for workers that send Telegram messages
    cfg = get_settings()
    if cfg.telegram_bot_token:
        from app.bot import build_bot, build_dispatcher

        ctx["bot"] = build_bot(cfg.telegram_bot_token)
        ctx["dp"] = build_dispatcher(cfg)


class WorkerSettings:
    redis_settings = _redis_settings()
    on_startup = on_startup
    functions = [
        func(send_broadcast, name="send_broadcast", timeout=300, max_tries=3),
        func(fire_post_visit_trigger, name="fire_post_visit_trigger", timeout=180, max_tries=3),
        func(index_kb_document, name="index_kb_document", timeout=600, max_tries=3),
        func(process_whatsapp_webhook, name="process_whatsapp_webhook", timeout=120, max_tries=3),
        func(send_whatsapp_booking_reminder, name="send_whatsapp_booking_reminder", timeout=120, max_tries=3),
        func(
            send_whatsapp_booking_client_notice,
            name="send_whatsapp_booking_client_notice",
            timeout=120,
            max_tries=3,
        ),
        func(
            send_whatsapp_booking_confirmation,
            name="send_whatsapp_booking_confirmation",
            timeout=120,
            max_tries=3,
        ),
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
        cron(
            run_review_sender,
            minute=set(range(0, 60, 10)),
            timeout=120,
            max_tries=3,
        ),
    ]
    job_timeout = 120
    max_tries = 3
