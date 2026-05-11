"""Статистика по услугам: топ и «мёртвые»."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from typing import Literal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import Booking
from app.models.catalog import Service
from app.models.enums import BookingStatus
from app.services.stats_common import period_utc_range


async def top_services(
    db: AsyncSession,
    *,
    dfrom: date,
    dto: date,
    limit: int = 20,
    order_by: Literal["revenue", "popularity"] = "revenue",
    master_id: UUID | None = None,
) -> list[dict]:
    start, end = period_utc_range(dfrom, dto)
    rev_sum = func.coalesce(func.sum(Booking.price), 0)
    cnt = func.count()
    order_col = rev_sum.desc() if order_by == "revenue" else cnt.desc()
    extra_filters = [Booking.master_id == master_id] if master_id else []
    rows = (
        (
            await db.execute(
                select(
                    Service.id,
                    Service.name_i18n,
                    rev_sum.label("rev"),
                    cnt.label("n"),
                )
                .join(Booking, Booking.service_id == Service.id)
                .where(
                    Booking.status == BookingStatus.completed,
                    Booking.starts_at >= start,
                    Booking.starts_at < end,
                    *extra_filters,
                )
                .group_by(Service.id)
                .order_by(order_col)
                .limit(limit)
            )
        )
        .all()
    )
    out: list[dict] = []
    for sid, name_i18n, rev, n in rows:
        revenue = Decimal(str(rev))
        n_int = int(n)
        avg = (revenue / n_int) if n_int else Decimal("0")
        out.append(
            {
                "service_id": str(sid),
                "name_i18n": dict(name_i18n) if name_i18n else {},
                "revenue": str(revenue.quantize(Decimal("0.01"))),
                "completed_bookings": n_int,
                "avg_check": str(avg.quantize(Decimal("0.01"))),
            }
        )
    return out


async def top_services_by_revenue(
    db: AsyncSession,
    *,
    dfrom: date,
    dto: date,
    limit: int = 20,
) -> list[dict]:
    return await top_services(db, dfrom=dfrom, dto=dto, limit=limit, order_by="revenue")


async def dead_services(
    db: AsyncSession,
    *,
    dto: date,
    dead_days: int = 30,
) -> list[dict]:
    """Услуги без завершённых записей за последние dead_days; включает last_booking_at."""
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

    last_booking_subq = (
        select(
            Booking.service_id.label("service_id"),
            func.max(Booking.starts_at).label("last_at"),
        )
        .where(Booking.starts_at.is_not(None))
        .group_by(Booking.service_id)
        .subquery()
    )

    rows = (
        (
            await db.execute(
                select(
                    Service.id,
                    Service.name_i18n,
                    Service.is_active,
                    last_booking_subq.c.last_at,
                )
                .outerjoin(last_booking_subq, last_booking_subq.c.service_id == Service.id)
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
            "last_booking_at": r[3].isoformat() if r[3] else None,
        }
        for r in rows
    ]
