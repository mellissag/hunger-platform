"""Пересчёт bot_visit_stat по дням (UPSERT)."""

from __future__ import annotations

from datetime import date, timedelta
from uuid import uuid4

from sqlalchemy import func, select, union_all
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_chat import AIConversation
from app.models.booking import Booking
from app.models.client import Client
from app.models.enums import BookingCreatedVia, BookingStatus
from app.models.stats import BotVisitStat
from app.services.stats_common import period_utc_range


async def refresh_bot_visit_stat_for_date(db: AsyncSession, day: date) -> None:
    """UPSERT одной строки bot_visit_stat за календарный день UTC."""
    start, end = period_utc_range(day, day)

    new_joins = int(
        (await db.execute(select(func.count()).select_from(Client).where(Client.joined_at >= start, Client.joined_at < end))).scalar_one()
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
                    Booking.status.in_((BookingStatus.no_show, BookingStatus.cancelled_by_client)),
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

    tbl = BotVisitStat.__table__
    ins = pg_insert(BotVisitStat).values(
        id=uuid4(),
        visit_date=day,
        unique_visitors=unique_visitors,
        new_joins=new_joins,
        bookings_started=bookings_started,
        bookings_completed=bookings_completed,
        bookings_abandoned=bookings_abandoned,
        ai_sessions=ai_sessions,
    )
    upsert = ins.on_conflict_do_update(
        index_elements=[tbl.c.date],
        set_={
            "unique_visitors": ins.excluded.unique_visitors,
            "new_joins": ins.excluded.new_joins,
            "bookings_started": ins.excluded.bookings_started,
            "bookings_completed": ins.excluded.bookings_completed,
            "bookings_abandoned": ins.excluded.bookings_abandoned,
            "ai_sessions": ins.excluded.ai_sessions,
        },
    )
    await db.execute(upsert)


async def refresh_bot_visit_stat_range(db: AsyncSession, dfrom: date, dto: date) -> None:
    d = dfrom
    while d <= dto:
        await refresh_bot_visit_stat_for_date(db, d)
        d += timedelta(days=1)
