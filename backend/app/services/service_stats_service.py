"""Статистика по услугам: топ и «мёртвые»."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import Booking
from app.models.catalog import Service
from app.models.enums import BookingStatus
from app.services.stats_common import period_utc_range


async def top_services_by_revenue(
    db: AsyncSession,
    *,
    dfrom: date,
    dto: date,
    limit: int = 20,
) -> list[dict]:
    start, end = period_utc_range(dfrom, dto)
    rows = (
        (
            await db.execute(
                select(
                    Service.id,
                    Service.name_i18n,
                    func.coalesce(func.sum(Booking.price), 0).label("rev"),
                    func.count().label("n"),
                )
                .join(Booking, Booking.service_id == Service.id)
                .where(
                    Booking.status == BookingStatus.completed,
                    Booking.starts_at >= start,
                    Booking.starts_at < end,
                )
                .group_by(Service.id)
                .order_by(func.coalesce(func.sum(Booking.price), 0).desc())
                .limit(limit)
            )
        )
        .all()
    )
    out: list[dict] = []
    for sid, name_i18n, rev, n in rows:
        out.append(
            {
                "service_id": str(sid),
                "name_i18n": dict(name_i18n) if name_i18n else {},
                "revenue": str(Decimal(str(rev)).quantize(Decimal("0.01"))),
                "completed_bookings": int(n),
            }
        )
    return out


async def dead_services(
    db: AsyncSession,
    *,
    dto: date,
    dead_days: int = 30,
) -> list[dict]:
    """Услуги без завершённых записей за последние dead_days (окно до dto включительно)."""
    dfrom = dto - timedelta(days=dead_days - 1)
    start, end = period_utc_range(dfrom, dto)

    busy = (
        select(Booking.service_id)
        .where(
            Booking.status == BookingStatus.completed,
            Booking.starts_at >= start,
            Booking.starts_at < end,
        )
        .distinct()
        .subquery()
    )

    rows = (
        (
            await db.execute(
                select(Service.id, Service.name_i18n, Service.is_active)
                .where(Service.is_active.is_(True))
                .where(Service.id.notin_(select(busy.c.service_id)))
            )
        )
        .all()
    )
    return [
        {
            "service_id": str(r[0]),
            "name_i18n": dict(r[1]) if r[1] else {},
            "is_active": r[2],
        }
        for r in rows
    ]
