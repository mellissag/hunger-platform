"""Граничные случаи сегментов рассылки."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
import pytest

from app.db.base import get_async_session_factory
from app.models.booking import BlacklistEntry, Booking
from app.models.catalog import Service, ServiceCategory
from app.models.client import Client
from app.models.enums import BookingStatus, ClientSource, PrepaymentStatus
from app.models.master import Master
from app.schemas.segment import SegmentCriteria
from app.services import segment_service


@pytest.mark.asyncio
async def test_vip_top_percent_single_client(fake_now) -> None:
    factory = get_async_session_factory()
    async with factory() as s:
        c = Client(
            tg_user_id=1001,
            lang="en",
            total_revenue=Decimal("999.00"),
            source=ClientSource.manual,
        )
        s.add(c)
        await s.commit()

    crit = SegmentCriteria(
        type="vip",
        top_percent=10,
        exclude_blacklist=True,
        exclude_marketing_opt_out=True,
    )
    async with factory() as s:
        n = await segment_service.count_segment_clients(s, crit)
        assert n == 1


@pytest.mark.asyncio
async def test_exclude_blacklist(fake_now) -> None:
    factory = get_async_session_factory()
    async with factory() as s:
        c1 = Client(tg_user_id=2001, lang="en", source=ClientSource.manual)
        c2 = Client(tg_user_id=2002, lang="en", source=ClientSource.manual)
        s.add_all([c1, c2])
        await s.flush()
        s.add(BlacklistEntry(client_id=c1.id, reason="x"))
        await s.commit()

    crit = SegmentCriteria(
        type="all",
        exclude_blacklist=True,
        exclude_marketing_opt_out=True,
    )
    async with factory() as s:
        ids = await segment_service.build_segment_ids(s, crit)
        assert len(ids) == 1


@pytest.mark.asyncio
async def test_marketing_opt_out_excluded(fake_now) -> None:
    factory = get_async_session_factory()
    async with factory() as s:
        c1 = Client(tg_user_id=3001, lang="en", source=ClientSource.manual, marketing_opted_out=False)
        c2 = Client(tg_user_id=3002, lang="en", source=ClientSource.manual, marketing_opted_out=True)
        s.add_all([c1, c2])
        await s.commit()

    crit = SegmentCriteria(
        type="all",
        exclude_blacklist=True,
        exclude_marketing_opt_out=True,
    )
    async with factory() as s:
        ids = await segment_service.build_segment_ids(s, crit)
        assert len(ids) == 1


@pytest.mark.asyncio
async def test_birthday_range_wrap_year(fake_now, monkeypatch) -> None:
    """ДР через границу года: 30 дек + окно 7 дней включает 5 янв."""
    fixed = datetime(2026, 12, 30, 12, 0, 0, tzinfo=UTC)
    monkeypatch.setattr(
        "app.services.segment_service.clock.utc_now",
        lambda: fixed,
    )
    monkeypatch.setattr(
        "app.core.clock.utc_now",
        lambda: fixed,
    )

    factory = get_async_session_factory()
    async with factory() as s:
        c = Client(
            tg_user_id=4001,
            lang="en",
            source=ClientSource.manual,
            birthday=date(1990, 1, 5),
        )
        s.add(c)
        await s.commit()

    crit = SegmentCriteria(
        type="birthday_range",
        days_ahead=10,
        exclude_blacklist=True,
        exclude_marketing_opt_out=True,
    )
    async with factory() as s:
        n = await segment_service.count_segment_clients(s, crit)
        assert n == 1


@pytest.mark.asyncio
async def test_by_service_requires_past_booking(fake_now) -> None:
    factory = get_async_session_factory()
    async with factory() as s:
        m = Master(
            display_name="M",
            bio={"en": "x", "ru": "", "uk": "", "bg": ""},
            specialization={"en": "s", "ru": "", "uk": "", "bg": ""},
        )
        s.add(m)
        await s.flush()
        cat = ServiceCategory(
            name_i18n={"en": "C", "ru": "", "uk": "", "bg": ""},
            sort_order=0,
        )
        s.add(cat)
        await s.flush()
        svc = Service(
            category_id=cat.id,
            name_i18n={"en": "S", "ru": "", "uk": "", "bg": ""},
            description_i18n={"en": "", "ru": "", "uk": "", "bg": ""},
            duration_minutes=30,
            price=Decimal("20.00"),
            is_active=True,
            sort_order=0,
        )
        s.add(svc)
        await s.flush()
        cl = Client(tg_user_id=5001, lang="en", source=ClientSource.manual)
        s.add(cl)
        await s.flush()
        future = fake_now + timedelta(days=7)
        s.add(
            Booking(
                client_id=cl.id,
                master_id=m.id,
                service_id=svc.id,
                starts_at=future,
                ends_at=future + timedelta(hours=1),
                status=BookingStatus.confirmed,
                price=Decimal("20.00"),
                prepayment_status=PrepaymentStatus.none,
            )
        )
        await s.commit()
        sid = svc.id

    crit = SegmentCriteria(
        type="by_service",
        service_id=sid,
        exclude_blacklist=True,
        exclude_marketing_opt_out=True,
    )
    async with factory() as s:
        n = await segment_service.count_segment_clients(s, crit)
        assert n == 0


@pytest.mark.asyncio
async def test_by_lang_normalizes_locale_prefix(fake_now) -> None:
    factory = get_async_session_factory()
    async with factory() as s:
        c = Client(tg_user_id=6001, lang="uk-UA", source=ClientSource.manual)
        s.add(c)
        await s.commit()

    crit = SegmentCriteria(
        type="by_lang",
        lang="uk",
        exclude_blacklist=True,
        exclude_marketing_opt_out=True,
    )
    async with factory() as s:
        n = await segment_service.count_segment_clients(s, crit)
        assert n == 1


@pytest.mark.asyncio
async def test_unknown_segment_type_raises() -> None:
    factory = get_async_session_factory()
    bad = SegmentCriteria.model_validate(
        {
            "type": "all",
            "exclude_blacklist": True,
            "exclude_marketing_opt_out": True,
        }
    )
    object.__setattr__(bad, "type", "nope")  # type: ignore[misc]
    async with factory() as s:
        with pytest.raises(ValueError, match="unknown segment"):
            await segment_service.build_segment_ids(s, bad)
