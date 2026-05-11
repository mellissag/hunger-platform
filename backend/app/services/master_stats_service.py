"""Статистика по мастерам: выручка, записи, рейтинг, загрузка, payroll, детали."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import Booking
from app.models.catalog import Service
from app.models.client import Client
from app.models.enums import BookingStatus
from app.models.master import Master
from app.services.stats_common import period_utc_range


async def list_master_stats(
    db: AsyncSession,
    *,
    dfrom: date,
    dto: date,
) -> list[dict]:
    start, end = period_utc_range(dfrom, dto)
    days = max(1, (dto - dfrom).days + 1)
    capacity_slots = days * 6

    masters = (await db.execute(select(Master).order_by(Master.sort_order.asc()))).scalars().all()
    out: list[dict] = []
    for m in masters:
        revenue_row = (
            await db.execute(
                select(func.coalesce(func.sum(Booking.price), 0)).where(
                    Booking.master_id == m.id,
                    Booking.status == BookingStatus.completed,
                    Booking.starts_at >= start,
                    Booking.starts_at < end,
                )
            )
        ).scalar_one()
        revenue = Decimal(str(revenue_row or 0))

        n_completed = int(
            (
                await db.execute(
                    select(func.count())
                    .select_from(Booking)
                    .where(
                        Booking.master_id == m.id,
                        Booking.status == BookingStatus.completed,
                        Booking.starts_at >= start,
                        Booking.starts_at < end,
                    )
                )
            ).scalar_one()
            or 0
        )

        avg_check = (revenue / n_completed) if n_completed else Decimal("0")
        utilization_pct = (
            min(100.0, (n_completed / float(capacity_slots)) * 100.0)
            if capacity_slots
            else 0.0
        )
        pct = Decimal(str(m.payroll_percent or 0))
        payroll = (revenue * pct / Decimal("100")).quantize(Decimal("0.01"))

        out.append(
            {
                "master_id": str(m.id),
                "display_name": m.display_name,
                "revenue": str(revenue.quantize(Decimal("0.01"))),
                "completed_bookings": n_completed,
                "avg_check": str(avg_check.quantize(Decimal("0.01"))),
                "rating_avg": str(m.rating_avg) if m.rating_avg is not None else None,
                "rating_count": m.rating_count,
                "utilization_pct": round(utilization_pct, 2),
                "payroll_percent": str(pct),
                "payroll_amount": str(payroll),
            }
        )
    return out


async def get_master_detail_stats(
    db: AsyncSession,
    *,
    master_id: UUID,
    dfrom: date,
    dto: date,
) -> dict | None:
    m = await db.get(Master, master_id)
    if m is None:
        return None

    start, end = period_utc_range(dfrom, dto)

    summary_list = await list_master_stats(db, dfrom=dfrom, dto=dto)
    summary = next((r for r in summary_list if r["master_id"] == str(master_id)), None)
    if summary is None:
        summary = {
            "master_id": str(master_id),
            "display_name": m.display_name,
            "revenue": "0.00",
            "completed_bookings": 0,
            "avg_check": "0.00",
            "rating_avg": str(m.rating_avg) if m.rating_avg is not None else None,
            "rating_count": m.rating_count,
            "utilization_pct": 0.0,
            "payroll_percent": str(Decimal(str(m.payroll_percent or 0))),
            "payroll_amount": "0.00",
        }

    day_bucket = func.date_trunc("day", Booking.starts_at).label("d")
    by_day_rows = (
        (
            await db.execute(
                select(
                    day_bucket,
                    func.coalesce(func.sum(Booking.price), 0),
                    func.count(),
                )
                .where(
                    Booking.master_id == master_id,
                    Booking.status == BookingStatus.completed,
                    Booking.starts_at >= start,
                    Booking.starts_at < end,
                )
                .group_by(day_bucket)
                .order_by(day_bucket)
            )
        )
        .all()
    )
    revenue_by_day: list[dict[str, str | int]] = []
    for day, rev, cnt in by_day_rows:
        d = day.date() if isinstance(day, datetime) else day
        revenue_by_day.append(
            {
                "date": d.isoformat() if hasattr(d, "isoformat") else str(d),
                "revenue": str(Decimal(str(rev)).quantize(Decimal("0.01"))),
                "bookings_count": int(cnt),
            }
        )

    svc_rows = (
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
                    Booking.master_id == master_id,
                    Booking.status == BookingStatus.completed,
                    Booking.starts_at >= start,
                    Booking.starts_at < end,
                )
                .group_by(Service.id)
                .order_by(func.coalesce(func.sum(Booking.price), 0).desc())
            )
        )
        .all()
    )
    services_breakdown = [
        {
            "service_id": str(sid),
            "name_i18n": dict(name_i18n) if name_i18n else {},
            "revenue": str(Decimal(str(rev)).quantize(Decimal("0.01"))),
            "completed_bookings": int(n),
        }
        for sid, name_i18n, rev, n in svc_rows
    ]

    client_ids_subq = (
        select(Booking.client_id)
        .where(
            Booking.master_id == master_id,
            Booking.status == BookingStatus.completed,
            Booking.starts_at >= start,
            Booking.starts_at < end,
        )
        .distinct()
        .subquery()
    )
    unique_clients = int(
        (await db.execute(select(func.count()).select_from(client_ids_subq))).scalar_one() or 0
    )

    first_booking_subq = (
        select(
            Booking.client_id.label("client_id"),
            func.min(Booking.starts_at).label("first_at"),
        )
        .where(Booking.master_id == master_id, Booking.starts_at.is_not(None))
        .group_by(Booking.client_id)
        .subquery()
    )
    new_clients = int(
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
    repeat_clients = max(0, unique_clients - new_clients)

    recent_rows = (
        (
            await db.execute(
                select(
                    Booking.id,
                    Booking.starts_at,
                    Booking.price,
                    Booking.status,
                    Client.first_name,
                    Client.last_name,
                    Service.name_i18n,
                )
                .join(Client, Booking.client_id == Client.id)
                .join(Service, Booking.service_id == Service.id, isouter=True)
                .where(
                    Booking.master_id == master_id,
                    Booking.starts_at.is_not(None),
                    Booking.starts_at >= start,
                    Booking.starts_at < end,
                )
                .order_by(Booking.starts_at.desc())
                .limit(5)
            )
        )
        .all()
    )
    recent_bookings = [
        {
            "booking_id": str(bid),
            "starts_at": ts.isoformat() if ts else None,
            "price": str(Decimal(str(price or 0)).quantize(Decimal("0.01"))),
            "status": st.value if hasattr(st, "value") else str(st),
            "client_name": " ".join(filter(None, [first or "", last or ""])).strip() or "—",
            "service_name_i18n": dict(s_i18n) if s_i18n else {},
        }
        for bid, ts, price, st, first, last, s_i18n in recent_rows
    ]

    return {
        **summary,
        "period": {"from": dfrom.isoformat(), "to": dto.isoformat()},
        "revenue_by_day": revenue_by_day,
        "services_breakdown": services_breakdown,
        "unique_clients": unique_clients,
        "new_clients": new_clients,
        "repeat_clients": repeat_clients,
        "recent_bookings": recent_bookings,
    }
