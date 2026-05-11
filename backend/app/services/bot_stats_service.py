"""Метрики бота: воронка, визиты, AI, удержание."""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import func, or_, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_chat import AIConversation
from app.models.booking import Booking
from app.models.client import Client
from app.models.enums import BookingCreatedVia, BookingStatus
from app.models.stats import BotVisitStat
from app.services.stats_common import period_utc_range


async def get_bot_stats(
    db: AsyncSession,
    *,
    dfrom: date,
    dto: date,
) -> dict:
    start, end = period_utc_range(dfrom, dto)

    new_joins = int(
        (
            await db.execute(
                select(func.count())
                .select_from(Client)
                .where(Client.joined_at >= start, Client.joined_at < end)
            )
        ).scalar_one()
        or 0
    )

    bookings_started = int(
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

    bookings_completed = int(
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

    bookings_abandoned = int(
        (
            await db.execute(
                select(func.count())
                .select_from(Booking)
                .where(
                    Booking.created_via == BookingCreatedVia.bot,
                    Booking.starts_at >= start,
                    Booking.starts_at < end,
                    or_(
                        Booking.status == BookingStatus.no_show,
                        Booking.status == BookingStatus.cancelled_by_client,
                    ),
                )
            )
        ).scalar_one()
        or 0
    )

    ai_sessions = int(
        (
            await db.execute(
                select(func.count())
                .select_from(AIConversation)
                .where(AIConversation.started_at >= start, AIConversation.started_at < end)
            )
        ).scalar_one()
        or 0
    )

    subq = union_all(
        select(Booking.client_id.label("cid")).where(
            Booking.created_at >= start,
            Booking.created_at < end,
        ),
        select(AIConversation.client_id.label("cid")).where(
            AIConversation.started_at >= start,
            AIConversation.started_at < end,
        ),
        select(Client.id.label("cid")).where(Client.joined_at >= start, Client.joined_at < end),
    ).subquery()
    unique_visitors = int(
        (
            await db.execute(select(func.count(func.distinct(subq.c.cid))).select_from(subq))
        ).scalar_one()
        or 0
    )

    stat_sum = (
        await db.execute(
            select(
                func.coalesce(func.sum(BotVisitStat.unique_visitors), 0),
                func.coalesce(func.sum(BotVisitStat.new_joins), 0),
                func.coalesce(func.sum(BotVisitStat.bookings_started), 0),
                func.coalesce(func.sum(BotVisitStat.bookings_completed), 0),
                func.coalesce(func.sum(BotVisitStat.bookings_abandoned), 0),
                func.coalesce(func.sum(BotVisitStat.ai_sessions), 0),
            ).where(BotVisitStat.visit_date >= dfrom, BotVisitStat.visit_date <= dto)
        )
    ).one()

    conversion = (
        float(bookings_completed) / float(bookings_started)
        if bookings_started
        else 0.0
    )

    return {
        "period": {"from": dfrom.isoformat(), "to": dto.isoformat()},
        "unique_visitors": unique_visitors,
        "new_joins": new_joins,
        "bookings_started": bookings_started,
        "bookings_completed": bookings_completed,
        "bookings_abandoned": bookings_abandoned,
        "ai_sessions": ai_sessions,
        "conversion_completed_per_started": round(conversion, 4),
        "bot_visit_stat_daily_sum": {
            "unique_visitors": int(stat_sum[0]),
            "new_joins": int(stat_sum[1]),
            "bookings_started": int(stat_sum[2]),
            "bookings_completed": int(stat_sum[3]),
            "bookings_abandoned": int(stat_sum[4]),
            "ai_sessions": int(stat_sum[5]),
        },
    }


async def get_bot_funnel_series(
    db: AsyncSession,
    *,
    dfrom: date,
    dto: date,
) -> list[dict[str, int | str]]:
    """По дням: joins, started, completed (для графиков)."""
    start, end = period_utc_range(dfrom, dto)
    day_bucket = func.date_trunc("day", Client.joined_at).label("day_bucket")
    rows = (
        (
            await db.execute(
                select(day_bucket, func.count())
                .where(Client.joined_at >= start, Client.joined_at < end)
                .group_by(day_bucket)
                .order_by(day_bucket)
            )
        )
        .all()
    )
    out: list[dict[str, int | str]] = []
    for day, cnt in rows:
        d = day.date() if isinstance(day, datetime) else day
        out.append({"date": d.isoformat() if hasattr(d, "isoformat") else str(d), "new_joins": int(cnt)})
    return out


async def get_bot_activity_daily(
    db: AsyncSession,
    *,
    dfrom: date,
    dto: date,
) -> list[dict[str, int | str]]:
    """По дням: уникальные пользователи, взаимодействовавшие с ботом (created booking, AI, joined)."""
    start, end = period_utc_range(dfrom, dto)
    activity = union_all(
        select(
            func.date_trunc("day", Booking.created_at).label("d"),
            Booking.client_id.label("cid"),
        ).where(Booking.created_at >= start, Booking.created_at < end),
        select(
            func.date_trunc("day", AIConversation.started_at).label("d"),
            AIConversation.client_id.label("cid"),
        ).where(AIConversation.started_at >= start, AIConversation.started_at < end),
        select(
            func.date_trunc("day", Client.joined_at).label("d"),
            Client.id.label("cid"),
        ).where(Client.joined_at >= start, Client.joined_at < end),
    ).subquery()

    rows = (
        (
            await db.execute(
                select(activity.c.d, func.count(func.distinct(activity.c.cid)))
                .group_by(activity.c.d)
                .order_by(activity.c.d)
            )
        )
        .all()
    )
    out: list[dict[str, int | str]] = []
    for day, cnt in rows:
        d = day.date() if isinstance(day, datetime) else day
        out.append(
            {
                "date": d.isoformat() if hasattr(d, "isoformat") else str(d),
                "active_users": int(cnt),
            }
        )
    return out


async def get_bot_retention(
    db: AsyncSession,
    *,
    dfrom: date,
    dto: date,
) -> dict:
    """Из клиентов с первой записью в период — сколько вернулись повторно (≥2 записей за всё время)."""
    start, end = period_utc_range(dfrom, dto)

    first_booking_subq = (
        select(
            Booking.client_id.label("client_id"),
            func.min(Booking.starts_at).label("first_at"),
        )
        .where(Booking.starts_at.is_not(None))
        .group_by(Booking.client_id)
        .subquery()
    )
    new_clients_in_period = (
        select(first_booking_subq.c.client_id)
        .where(
            first_booking_subq.c.first_at >= start,
            first_booking_subq.c.first_at < end,
        )
        .subquery()
    )
    new_count = int(
        (await db.execute(select(func.count()).select_from(new_clients_in_period))).scalar_one()
        or 0
    )

    multi_clients = (
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
                .select_from(new_clients_in_period)
                .where(new_clients_in_period.c.client_id.in_(select(multi_clients.c.client_id)))
            )
        ).scalar_one()
        or 0
    )
    rate = float(retained) / float(new_count) if new_count else 0.0
    return {
        "new_clients_in_period": new_count,
        "retained_clients": retained,
        "retention_rate": round(rate, 4),
    }
