"""ARQ: Instagram Messaging webhook processing."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

import app.core.clock as clock

from app.config import get_settings
from app.models.client import Client
from app.models.instagram_message import InstagramMessage, InstagramMsgDirection
from app.services.instagram import (
    is_instagram_configured,
    persist_instagram_inbound_chat_message,
)
from app.services.instagram import get_or_create_client_for_instagram_user
from app.services.instagram_bot import handle_instagram_message

logger = logging.getLogger(__name__)


def _iter_instagram_events(payload: dict) -> list[dict[str, Any]]:
    """Normalize Instagram webhook payloads (messaging[] or changes[])."""
    events: list[dict[str, Any]] = []
    if payload.get("object") not in ("instagram", "page", None):
        return events
    for entry in payload.get("entry") or []:
        if not isinstance(entry, dict):
            continue
        for item in entry.get("messaging") or []:
            if isinstance(item, dict):
                events.append(item)
        for change in entry.get("changes") or []:
            if not isinstance(change, dict):
                continue
            val = change.get("value")
            if not isinstance(val, dict):
                continue
            for item in val.get("messaging") or []:
                if isinstance(item, dict):
                    events.append(item)
    return events


async def process_instagram_webhook(ctx: dict[str, Any], payload_json: str) -> None:
    settings = get_settings()
    factory = ctx["db"]
    try:
        payload = json.loads(payload_json)
    except json.JSONDecodeError:
        logger.warning("instagram webhook: invalid json")
        return
    if not isinstance(payload, dict):
        return

    redis = None
    if settings.redis_url:
        from redis.asyncio import Redis

        redis = Redis.from_url(settings.redis_url, decode_responses=True)

    try:
        async with factory() as session:
            for event in _iter_instagram_events(payload):
                sender = event.get("sender")
                if not isinstance(sender, dict):
                    continue
                ig_user_id = sender.get("id")
                if not isinstance(ig_user_id, str) or not ig_user_id.strip():
                    continue
                ig_user_id = ig_user_id.strip()

                message = event.get("message")
                if not isinstance(message, dict):
                    continue
                if message.get("is_echo"):
                    continue
                ig_mid = message.get("mid") or message.get("id")
                if not isinstance(ig_mid, str):
                    continue

                text_body: str | None = None
                if isinstance(message.get("text"), str):
                    text_body = message["text"]
                elif isinstance(message.get("text"), dict):
                    tb = message["text"].get("body")
                    text_body = str(tb) if tb is not None else None

                dup = await session.scalar(
                    select(func.count())
                    .select_from(InstagramMessage)
                    .where(InstagramMessage.ig_message_id == ig_mid)
                )
                if dup:
                    continue

                ts_raw = event.get("timestamp")
                created_at: datetime | None = None
                if ts_raw is not None:
                    try:
                        ts_int = int(str(ts_raw))
                        if ts_int > 10_000_000_000:
                            ts_int //= 1000
                        created_at = datetime.fromtimestamp(ts_int, tz=timezone.utc)
                    except (TypeError, ValueError, OSError):
                        created_at = None

                client = await session.scalar(
                    select(Client).where(Client.instagram_user_id == ig_user_id).limit(1)
                )
                im = InstagramMessage(
                    client_id=client.id if client else None,
                    direction=InstagramMsgDirection.IN,
                    text=text_body,
                    ig_message_id=ig_mid,
                    instagram_user_id=ig_user_id,
                    created_at=created_at or clock.utc_now(),
                )
                session.add(im)
                await session.flush()

                if not isinstance(text_body, str) or not text_body.strip():
                    await session.commit()
                    continue

                c = await get_or_create_client_for_instagram_user(session, ig_user_id)
                im.client_id = c.id
                await persist_instagram_inbound_chat_message(
                    session,
                    client_id=c.id,
                    text=text_body,
                    redis=redis,
                )

                if not is_instagram_configured(settings):
                    logger.warning(
                        "instagram webhook: inbound persisted but bot replies disabled — "
                        "set INSTAGRAM_PAGE_ACCESS_TOKEN and INSTAGRAM_ACCOUNT_ID "
                        "(ig_mid=%s client_id=%s)",
                        ig_mid,
                        c.id,
                    )
                else:
                    try:
                        await handle_instagram_message(
                            db=session,
                            redis=redis,
                            instagram_user_id=ig_user_id,
                            text=text_body,
                            client=c,
                            telegram_bot=ctx.get("bot"),
                        )
                        logger.info(
                            "instagram bot ok ig_mid=%s client_id=%s",
                            ig_mid,
                            c.id,
                        )
                    except Exception:
                        logger.exception(
                            "instagram bot failed ig_mid=%s client_id=%s",
                            ig_mid,
                            c.id,
                        )
                await session.commit()
    finally:
        if redis is not None:
            await redis.aclose()
