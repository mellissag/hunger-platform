"""Лимит запросов к AI: 20/час на клиента (Redis или fallback через БД)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from redis.asyncio import Redis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_chat import AIConversation, AIMessage
from app.models.enums import AIMessageRole

_RL_LIMIT = 20
_RL_WINDOW_SEC = 3600
_KEY_PREFIX = "ai:rl:"


def _hour_bucket(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC).strftime("%Y%m%d%H")


async def check_ai_rate_limit(
    db: AsyncSession,
    redis: Redis | None,
    client_id: uuid.UUID,
) -> None:
    from app.core.exceptions import AIRateLimitError

    now = datetime.now(tz=UTC)

    if redis is not None:
        key = f"{_KEY_PREFIX}{client_id}:{_hour_bucket(now)}"
        n = await redis.incr(key)
        if n == 1:
            await redis.expire(key, _RL_WINDOW_SEC + 60)
        if n > _RL_LIMIT:
            raise AIRateLimitError()
        return

    since = now - timedelta(seconds=_RL_WINDOW_SEC)
    cnt = (
        await db.execute(
            select(func.count())
            .select_from(AIMessage)
            .join(AIConversation, AIMessage.conversation_id == AIConversation.id)
            .where(
                AIMessage.role == AIMessageRole.user,
                AIMessage.created_at >= since,
                AIConversation.client_id == client_id,
            )
        )
    ).scalar_one()
    if int(cnt or 0) >= _RL_LIMIT:
        raise AIRateLimitError()
