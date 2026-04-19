"""Построение выборки клиентов по критериям сегмента рассылки."""

from __future__ import annotations

import math
from datetime import UTC, date, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import Select, and_, exists, func, not_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

import app.core.clock as clock

from app.models.booking import BlacklistEntry, Booking
from app.models.client import Client
from app.models.enums import BookingStatus
from app.schemas.segment import SegmentCriteria


def _utc_today() -> date:
    return clock.utc_now().astimezone(UTC).date()


def _birthday_in_next_days(birth: date | None, today: date, days_ahead: int) -> bool:
    if birth is None:
        return False
    for delta in range(days_ahead + 1):
        d = today + timedelta(days=delta)
        if d.month == birth.month and d.day == birth.day:
            return True
    return False


def _blacklist_ids_subquery() -> Select[Any]:
    now = clock.utc_now()
    return select(BlacklistEntry.client_id).where(
        or_(BlacklistEntry.expires_at.is_(None), BlacklistEntry.expires_at > now)
    )


def _base_excludes(criteria: SegmentCriteria) -> list[Any]:
    cond: list[Any] = []
    if criteria.exclude_marketing_opt_out:
        cond.append(Client.marketing_opted_out.is_(False))
    if criteria.exclude_blacklist:
        cond.append(not_(Client.id.in_(_blacklist_ids_subquery())))
    return cond


def _telegram_ready() -> Any:
    return Client.tg_user_id.isnot(None)


def _past_booking_filter() -> Any:
    now = clock.utc_now()
    return and_(
        Booking.starts_at < now,
        Booking.status.in_(
            (
                BookingStatus.completed,
                BookingStatus.no_show,
                BookingStatus.confirmed,
            )
        ),
    )


async def _segment_ids_vip(
    session: AsyncSession, criteria: SegmentCriteria, base_where: list[Any]
) -> list[UUID]:
    assert criteria.top_percent is not None
    tp = criteria.top_percent
    cnt_stmt = select(func.count()).select_from(Client).where(*base_where)
    total = int((await session.execute(cnt_stmt)).scalar_one() or 0)
    if total == 0:
        return []
    limit_k = max(1, math.ceil(total * tp / 100.0))
    res = await session.execute(
        select(Client.id)
        .where(*base_where)
        .order_by(Client.total_revenue.desc())
        .limit(limit_k)
    )
    return [r[0] for r in res.all()]


async def _segment_ids_birthday(
    session: AsyncSession, criteria: SegmentCriteria, base_where: list[Any]
) -> list[UUID]:
    assert criteria.days_ahead is not None
    da = criteria.days_ahead
    today = _utc_today()
    stmt = select(Client.id, Client.birthday).where(
        *base_where,
        Client.birthday.isnot(None),
    )
    rows = (await session.execute(stmt)).all()
    out: list[UUID] = []
    for cid, bday in rows:
        if bday and _birthday_in_next_days(bday, today, da):
            out.append(cid)
    return out


async def build_segment_ids(session: AsyncSession, criteria: SegmentCriteria) -> list[UUID]:
    """Список client.id для рассылки (только с Telegram)."""
    now = clock.utc_now()
    t = criteria.type
    base_where: list[Any] = [_telegram_ready(), *_base_excludes(criteria)]

    if t == "all":
        res = await session.execute(select(Client.id).where(*base_where))
        return [r[0] for r in res.all()]

    if t == "new_last_n":
        assert criteria.days is not None
        cutoff = now - timedelta(days=criteria.days)
        res = await session.execute(
            select(Client.id).where(*base_where, Client.joined_at >= cutoff)
        )
        return [r[0] for r in res.all()]

    if t == "dormant":
        assert criteria.days is not None
        cutoff = now - timedelta(days=criteria.days)
        res = await session.execute(
            select(Client.id).where(
                *base_where,
                or_(Client.last_visit_at.is_(None), Client.last_visit_at < cutoff),
            )
        )
        return [r[0] for r in res.all()]

    if t == "birthday_range":
        return await _segment_ids_birthday(session, criteria, base_where)

    if t == "by_service":
        assert criteria.service_id is not None
        sid = criteria.service_id
        ex = exists().where(
            Booking.client_id == Client.id,
            Booking.service_id == sid,
            _past_booking_filter(),
        )
        res = await session.execute(select(Client.id).where(*base_where, ex))
        return [r[0] for r in res.all()]

    if t == "by_master":
        assert criteria.master_id is not None
        mid = criteria.master_id
        ex = exists().where(
            Booking.client_id == Client.id,
            Booking.master_id == mid,
            _past_booking_filter(),
        )
        res = await session.execute(select(Client.id).where(*base_where, ex))
        return [r[0] for r in res.all()]

    if t == "vip":
        return await _segment_ids_vip(session, criteria, base_where)

    if t == "regular":
        assert criteria.min_bookings is not None
        mb = criteria.min_bookings
        res = await session.execute(
            select(Client.id).where(*base_where, Client.total_bookings >= mb)
        )
        return [r[0] for r in res.all()]

    if t == "by_tag":
        assert criteria.tag is not None
        tag = criteria.tag
        res = await session.execute(
            select(Client.id).where(*base_where, Client.tags.contains([tag]))
        )
        return [r[0] for r in res.all()]

    if t == "by_lang":
        assert criteria.lang is not None
        lang = criteria.lang
        lang_key = func.lower(func.split_part(Client.lang, "-", 1))
        res = await session.execute(select(Client.id).where(*base_where, lang_key == lang))
        return [r[0] for r in res.all()]

    if t == "no_show":
        mc = criteria.min_count or 1
        res = await session.execute(
            select(Client.id).where(*base_where, Client.no_show_count >= mc)
        )
        return [r[0] for r in res.all()]

    raise ValueError(f"unknown segment type: {t}")


async def count_segment_clients(session: AsyncSession, criteria: SegmentCriteria) -> int:
    ids = await build_segment_ids(session, criteria)
    return len(ids)
