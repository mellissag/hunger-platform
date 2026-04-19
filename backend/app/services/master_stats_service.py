"""Статистика по мастерам: выручка, записи, рейтинг, загрузка, payroll."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import Booking
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
                select(func.coalesce(func.sum(Booking.price), 0))
                .where(
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

        utilization_pct = min(100.0, (n_completed / float(capacity_slots)) * 100.0) if capacity_slots else 0.0
        pct = Decimal(str(m.payroll_percent or 0))
        payroll = (revenue * pct / Decimal("100")).quantize(Decimal("0.01"))

        out.append(
            {
                "master_id": str(m.id),
                "display_name": m.display_name,
                "revenue": str(revenue.quantize(Decimal("0.01"))),
                "completed_bookings": n_completed,
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
    all_stats = await list_master_stats(db, dfrom=dfrom, dto=dto)
    for r in all_stats:
        if r["master_id"] == str(master_id):
            return {**r, "period": {"from": dfrom.isoformat(), "to": dto.isoformat()}}
    return None
