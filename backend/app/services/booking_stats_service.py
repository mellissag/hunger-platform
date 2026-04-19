"""Статистика по записям: выручка, конверсия, heatmap, LTV, retention."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import Booking
from app.models.client import Client
from app.models.enums import BookingCreatedVia, BookingStatus
from app.models.salon import Salon
from app.services.stats_common import get_salon_timezone, period_utc_range


async def get_booking_overview(
    db: AsyncSession,
    *,
    dfrom: date,
    dto: date,
) -> dict:
    start, end = period_utc_range(dfrom, dto)

    revenue_row = (
        await db.execute(
            select(func.coalesce(func.sum(Booking.price), 0))
            .where(
                Booking.status == BookingStatus.completed,
                Booking.starts_at >= start,
                Booking.starts_at < end,
            )
        )
    ).scalar_one()
    revenue = Decimal(str(revenue_row or 0))

    completed_n = int(
        (
            await db.execute(
                select(func.count())
                .select_from(Booking)
                .where(
                    Booking.status == BookingStatus.completed,
                    Booking.starts_at >= start,
                    Booking.starts_at < end,
                )
            )
        ).scalar_one()
        or 0
    )

    started_bot = int(
        (
            await db.execute(
                select(func.count())
                .select_from(Booking)
                .where(
                    Booking.created_via == BookingCreatedVia.bot,
                    Booking.created_at >= start,
                    Booking.created_at < end,
                )
            )
        ).scalar_one()
        or 0
    )

    avg_check = (revenue / completed_n) if completed_n else Decimal("0")

    # LTV: средняя total_revenue у клиентов с завершённой записью в периоде
    sub_clients = (
        select(Booking.client_id)
        .where(
            Booking.status == BookingStatus.completed,
            Booking.starts_at >= start,
            Booking.starts_at < end,
        )
        .distinct()
        .subquery()
    )
    ltv_row = (
        await db.execute(
            select(func.coalesce(func.avg(Client.total_revenue), 0)).where(
                Client.id.in_(select(sub_clients.c.client_id))
            )
        )
    ).scalar_one()
    ltv = Decimal(str(ltv_row or 0))

    # Retention: клиенты периода с ≥2 завершёнными записями за всё время
    multi_completed = (
        select(Booking.client_id)
        .where(Booking.status == BookingStatus.completed)
        .group_by(Booking.client_id)
        .having(func.count() >= 2)
        .subquery()
    )
    retained = int(
        (
            await db.execute(
                select(func.count())
                .select_from(sub_clients)
                .where(sub_clients.c.client_id.in_(select(multi_completed.c.client_id)))
            )
        ).scalar_one()
        or 0
    )
    total_pc = int((await db.execute(select(func.count()).select_from(sub_clients))).scalar_one() or 0)
    retention_rate = float(retained) / float(total_pc) if total_pc else 0.0

    conversion = float(completed_n) / float(started_bot) if started_bot else 0.0

    return {
        "revenue": str(revenue.quantize(Decimal("0.01"))),
        "completed_bookings": completed_n,
        "bookings_started_bot": started_bot,
        "avg_check": str(avg_check.quantize(Decimal("0.01"))),
        "ltv_avg": str(ltv.quantize(Decimal("0.01"))),
        "retention_repeat_clients": retained,
        "retention_clients_in_period": total_pc,
        "retention_rate": round(retention_rate, 4),
        "conversion_completed_per_bot_started": round(conversion, 4),
    }


async def get_revenue_trend_daily(
    db: AsyncSession,
    *,
    dfrom: date,
    dto: date,
) -> list[dict[str, str]]:
    """Выручка по дням (UTC date of starts_at)."""
    start, end = period_utc_range(dfrom, dto)
    day_st = func.date_trunc("day", Booking.starts_at).label("d")
    rows = (
        (
            await db.execute(
                select(
                    day_st,
                    func.coalesce(func.sum(Booking.price), 0),
                )
                .where(
                    Booking.status == BookingStatus.completed,
                    Booking.starts_at >= start,
                    Booking.starts_at < end,
                )
                .group_by(day_st)
                .order_by(day_st)
            )
        )
        .all()
    )
    out: list[dict[str, str]] = []
    for day, rev in rows:
        d = day.date() if isinstance(day, datetime) else day
        ds = d.isoformat() if hasattr(d, "isoformat") else str(d)
        out.append({"date": ds, "revenue": str(Decimal(str(rev)).quantize(Decimal("0.01")))})
    return out


async def get_heatmap(
    db: AsyncSession,
    *,
    dfrom: date,
    dto: date,
) -> list[dict[str, int]]:
    """Частоты завершённых записей: день недели (0=Пн) × час в timezone салона."""
    start, end = period_utc_range(dfrom, dto)
    tz_name = await get_salon_timezone(db)
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = ZoneInfo("UTC")

    rows = (
        (
            await db.execute(
                select(Booking.starts_at).where(
                    Booking.status == BookingStatus.completed,
                    Booking.starts_at >= start,
                    Booking.starts_at < end,
                )
            )
        )
        .scalars()
        .all()
    )

    cells: dict[tuple[int, int], int] = {}
    for ts in rows:
        local = ts.astimezone(tz)
        key = (local.weekday(), local.hour)
        cells[key] = cells.get(key, 0) + 1

    out: list[dict[str, int]] = []
    for (dow, hour), cnt in sorted(cells.items()):
        out.append({"dow": dow, "hour": hour, "count": cnt})
    return out


async def get_currency(db: AsyncSession) -> str:
    r = await db.execute(select(Salon.currency).limit(1))
    return str(r.scalar_one_or_none() or "EUR")
