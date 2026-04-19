"""Ежедневный пересчёт bot_visit_stat за вчера (UTC)."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

import app.core.clock as clock
from app.services import stats_refresh_service


async def refresh_bot_visit_stats_yesterday(ctx: dict[str, Any]) -> None:
    factory = ctx["db"]
    day = clock.utc_now().date() - timedelta(days=1)
    async with factory() as session:
        await stats_refresh_service.refresh_bot_visit_stat_for_date(session, day)
        await session.commit()
