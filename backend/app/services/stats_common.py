"""Общие утилиты для статистики: период UTC, timezone салона."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.salon import Salon


def period_utc_range(dfrom: date, dto: date) -> tuple[datetime, datetime]:
    """Полуинтервал [start, end) в UTC для календарных дат dfrom..dto включительно."""
    start = datetime(dfrom.year, dfrom.month, dfrom.day, tzinfo=UTC)
    end = datetime(dto.year, dto.month, dto.day, tzinfo=UTC) + timedelta(days=1)
    return start, end


async def get_salon_timezone(db: AsyncSession) -> str:
    r = await db.execute(select(Salon.timezone).limit(1))
    tz = r.scalar_one_or_none()
    return tz or "UTC"
