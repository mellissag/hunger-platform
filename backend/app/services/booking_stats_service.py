"""Статистика по записям: выручка, конверсия, heatmap, LTV, retention, источники, воронка, пики."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import Booking
from app.models.catalog import Service
from app.models.client import Client
from app.models.enums import BookingCreatedVia, BookingStatus
from app.models.salon import Salon
from app.services.stats_common import get_salon_timezone, period_utc_range


GroupBy = Literal["day", "week", "month"]


def _period_length_days(dfrom: date, dto: date) -> int:
    return (dto - dfrom).days + 1


def _previous_period(dfrom: date, dto: date) -> tuple[date, date]:
    n = _period_length_days(dfrom, dto)
    prev_to = dfrom - timedelta(days=1)
    prev_from = prev_to - timedelta(days=n - 1)
    return prev_from, prev_to


def _master_filter(master_id: UUID | None):
    return [Booking.master_id == master_id] if master_id else []


async def _revenue_completed(
    db: AsyncSession,
    *,
    dfrom: date,
    dto: date,
    master_id: UUID | None = None,
) -> tuple[Decimal, int]:
    start, end = period_utc_range(dfrom, dto)
    revenue_row = (
        await db.execute(
            select(func.coalesce(func.sum(Booking.price), 0)).where(
                Booking.status == BookingStatus.completed,
                Booking.starts_at >= start,
                Booking.starts_at < end,
                *_master_filter(master_id),
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
                    *_master_filter(master_id),
                )
            )
        ).scalar_one()
        or 0
    )
    return revenue, completed_n


async def _cancelled_count(
    db: AsyncSession,
    *,
    dfrom: date,
    dto: date,
    master_id: UUID | None = None,
) -> int:
    start, end = period_utc_range(dfrom, dto)
    n = int(
        (
            await db.execute(
                select(func.count())
                .select_from(Booking)
                .where(
                    Booking.status.in_(
                        [
                            BookingStatus.cancelled_by_client,
                            BookingStatus.cancelled_by_salon,
                        ]
                    ),
                    Booking.starts_at >= start,
                    Booking.starts_at < end,
                    *_master_filter(master_id),
                )
            )
        ).scalar_one()
        or 0
    )
    return n


async def _new_clients_count(
    db: AsyncSession,
    *,
    dfrom: date,
    dto: date,
    master_id: UUID | None = None,
) -> int:
    """Уникальные клиенты, у которых первое бронирование (по starts_at) приходится на период."""
    start, end = period_utc_range(dfrom, dto)
    first_booking_subq = (
        select(
            Booking.client_id.label("client_id"),
            func.min(Booking.starts_at).label("first_at"),
        )
        .where(*_master_filter(master_id), Booking.starts_at.is_not(None))
        .group_by(Booking.client_id)
        .subquery()
    )
    n = int(
        (
            await db.execute(
                select(func.count()).select_from(first_booking_subq).where(
                    first_booking_subq.c.first_at >= start,
                    first_booking_subq.c.first_at < end,
                )
            )
        ).scalar_one()
        or 0
    )
    return n


async def get_booking_overview(
    db: AsyncSession,
    *,
    dfrom: date,
    dto: date,
    master_id: UUID | None = None,
) -> dict:
    start, end = period_utc_range(dfrom, dto)

    revenue, completed_n = await _revenue_completed(
        db, dfrom=dfrom, dto=dto, master_id=master_id
    )
    cancelled_n = await _cancelled_count(db, dfrom=dfrom, dto=dto, master_id=master_id)
    new_clients_n = await _new_clients_count(
        db, dfrom=dfrom, dto=dto, master_id=master_id
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
                    *_master_filter(master_id),
                )
            )
        ).scalar_one()
        or 0
    )

    avg_check = (revenue / completed_n) if completed_n else Decimal("0")

    sub_clients = (
        select(Booking.client_id)
        .where(
            Booking.status == BookingStatus.completed,
            Booking.starts_at >= start,
            Booking.starts_at < end,
            *_master_filter(master_id),
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

    multi_completed = (
        select(Booking.client_id)
        .where(
            Booking.status == BookingStatus.completed,
            *_master_filter(master_id),
        )
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
    total_pc = int(
        (await db.execute(select(func.count()).select_from(sub_clients))).scalar_one() or 0
    )
    retention_rate = float(retained) / float(total_pc) if total_pc else 0.0
    conversion = float(completed_n) / float(started_bot) if started_bot else 0.0

    pfrom, pto = _previous_period(dfrom, dto)
    prev_revenue, prev_completed = await _revenue_completed(
        db, dfrom=pfrom, dto=pto, master_id=master_id
    )
    prev_avg_check = (prev_revenue / prev_completed) if prev_completed else Decimal("0")
    prev_cancelled = await _cancelled_count(
        db, dfrom=pfrom, dto=pto, master_id=master_id
    )
    prev_new_clients = await _new_clients_count(
        db, dfrom=pfrom, dto=pto, master_id=master_id
    )

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
        "new_clients_count": new_clients_n,
        "cancelled_bookings_count": cancelled_n,
        "prev_revenue": str(prev_revenue.quantize(Decimal("0.01"))),
        "prev_completed_bookings": prev_completed,
        "prev_avg_check": str(prev_avg_check.quantize(Decimal("0.01"))),
        "prev_new_clients_count": prev_new_clients,
        "prev_cancelled_bookings_count": prev_cancelled,
    }


async def get_revenue_trend(
    db: AsyncSession,
    *,
    dfrom: date,
    dto: date,
    group_by: GroupBy = "day",
    master_id: UUID | None = None,
) -> list[dict[str, str | int]]:
    """Выручка + количество завершённых записей по периодам (day/week/month)."""
    start, end = period_utc_range(dfrom, dto)
    bucket_expr = func.date_trunc(group_by, Booking.starts_at).label("d")
    rows = (
        (
            await db.execute(
                select(
                    bucket_expr,
                    func.coalesce(func.sum(Booking.price), 0),
                    func.count(),
                )
                .where(
                    Booking.status == BookingStatus.completed,
                    Booking.starts_at >= start,
                    Booking.starts_at < end,
                    *_master_filter(master_id),
                )
                .group_by(bucket_expr)
                .order_by(bucket_expr)
            )
        )
        .all()
    )
    out: list[dict[str, str | int]] = []
    for day, rev, cnt in rows:
        d = day.date() if isinstance(day, datetime) else day
        ds = d.isoformat() if hasattr(d, "isoformat") else str(d)
        out.append(
            {
                "date": ds,
                "revenue": str(Decimal(str(rev)).quantize(Decimal("0.01"))),
                "bookings_count": int(cnt),
            }
        )
    return out


async def get_revenue_trend_daily(
    db: AsyncSession,
    *,
    dfrom: date,
    dto: date,
    master_id: UUID | None = None,
) -> list[dict[str, str]]:
    """Legacy: только выручка по дням (без bookings_count)."""
    trend = await get_revenue_trend(
        db, dfrom=dfrom, dto=dto, group_by="day", master_id=master_id
    )
    return [{"date": r["date"], "revenue": r["revenue"]} for r in trend]  # type: ignore[misc]


async def get_heatmap(
    db: AsyncSession,
    *,
    dfrom: date,
    dto: date,
    master_id: UUID | None = None,
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
                    *_master_filter(master_id),
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


async def get_peak_hours(
    db: AsyncSession,
    *,
    dfrom: date,
    dto: date,
    master_id: UUID | None = None,
) -> list[dict[str, float | int]]:
    """Средние записи по часу дня (0–23) за выбранный период (в timezone салона)."""
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
                    *_master_filter(master_id),
                )
            )
        )
        .scalars()
        .all()
    )

    counts: dict[int, int] = {h: 0 for h in range(24)}
    for ts in rows:
        local = ts.astimezone(tz)
        counts[local.hour] = counts.get(local.hour, 0) + 1

    days = max(1, _period_length_days(dfrom, dto))
    return [
        {"hour": h, "count": counts[h], "avg_per_day": round(counts[h] / days, 2)}
        for h in range(24)
    ]


async def get_booking_sources(
    db: AsyncSession,
    *,
    dfrom: date,
    dto: date,
    master_id: UUID | None = None,
) -> list[dict[str, str | int]]:
    """Разбивка по `created_via` (bot / mini_app / admin / manual) — donut chart."""
    start, end = period_utc_range(dfrom, dto)
    rows = (
        (
            await db.execute(
                select(Booking.created_via, func.count())
                .where(
                    Booking.created_at >= start,
                    Booking.created_at < end,
                    *_master_filter(master_id),
                )
                .group_by(Booking.created_via)
            )
        )
        .all()
    )
    return [{"source": str(via.value if hasattr(via, "value") else via), "count": int(cnt)} for via, cnt in rows]


async def get_top_services(
    db: AsyncSession,
    *,
    dfrom: date,
    dto: date,
    master_id: UUID | None = None,
    limit: int = 5,
    order_by: Literal["revenue", "popularity"] = "revenue",
) -> list[dict]:
    """Топ-N услуг по выручке или популярности (кол-во записей)."""
    start, end = period_utc_range(dfrom, dto)
    order_col = (
        func.coalesce(func.sum(Booking.price), 0).desc()
        if order_by == "revenue"
        else func.count().desc()
    )
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
                    *_master_filter(master_id),
                )
                .group_by(Service.id)
                .order_by(order_col)
                .limit(limit)
            )
        )
        .all()
    )
    return [
        {
            "service_id": str(sid),
            "name_i18n": dict(name_i18n) if name_i18n else {},
            "revenue": str(Decimal(str(rev)).quantize(Decimal("0.01"))),
            "completed_bookings": int(n),
        }
        for sid, name_i18n, rev, n in rows
    ]


async def get_funnel(
    db: AsyncSession,
    *,
    dfrom: date,
    dto: date,
    master_id: UUID | None = None,
) -> list[dict[str, str | int]]:
    """Воронка: бот-визит → регистрация → завершение регистрации → первая запись → повторная."""
    start, end = period_utc_range(dfrom, dto)

    bot_visitors = int(
        (
            await db.execute(
                select(func.count())
                .select_from(Client)
                .where(
                    Client.last_bot_activity_at.is_not(None),
                    Client.last_bot_activity_at >= start,
                    Client.last_bot_activity_at < end,
                )
            )
        ).scalar_one()
        or 0
    )

    registration_started = int(
        (
            await db.execute(
                select(func.count())
                .select_from(Client)
                .where(Client.joined_at >= start, Client.joined_at < end)
            )
        ).scalar_one()
        or 0
    )

    registration_completed = int(
        (
            await db.execute(
                select(func.count())
                .select_from(Client)
                .where(
                    Client.joined_at >= start,
                    Client.joined_at < end,
                    Client.phone.is_not(None),
                )
            )
        ).scalar_one()
        or 0
    )

    first_booking_subq = (
        select(
            Booking.client_id.label("client_id"),
            func.min(Booking.starts_at).label("first_at"),
        )
        .where(*_master_filter(master_id), Booking.starts_at.is_not(None))
        .group_by(Booking.client_id)
        .subquery()
    )
    first_bookings = int(
        (
            await db.execute(
                select(func.count())
                .select_from(first_booking_subq)
                .where(
                    first_booking_subq.c.first_at >= start,
                    first_booking_subq.c.first_at < end,
                )
            )
        ).scalar_one()
        or 0
    )

    multi_clients = (
        select(Booking.client_id)
        .where(
            Booking.status == BookingStatus.completed,
            Booking.starts_at >= start,
            Booking.starts_at < end,
            *_master_filter(master_id),
        )
        .group_by(Booking.client_id)
        .having(func.count() >= 2)
        .subquery()
    )
    repeat_bookings = int(
        (
            await db.execute(select(func.count()).select_from(multi_clients))
        ).scalar_one()
        or 0
    )

    steps = [
        {"key": "bot_visitors", "count": bot_visitors},
        {"key": "registration_started", "count": registration_started},
        {"key": "registration_completed", "count": registration_completed},
        {"key": "first_booking", "count": first_bookings},
        {"key": "repeat_booking", "count": repeat_bookings},
    ]
    return steps  # type: ignore[return-value]


async def get_currency(db: AsyncSession) -> str:
    r = await db.execute(select(Salon.currency).limit(1))
    return str(r.scalar_one_or_none() or "EUR")
