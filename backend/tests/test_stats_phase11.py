"""Агрегации статистики на сид-данных."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
import uuid

import pytest
from httpx import AsyncClient

from app.db.base import get_async_session_factory
from app.models.booking import Booking
from app.models.catalog import Service, ServiceCategory
from app.models.client import Client
from app.models.enums import BookingCreatedVia, BookingStatus, ClientSource, PrepaymentStatus
from app.models.master import Master
from app.models.salon import Salon
from app.services import booking_stats_service, master_stats_service, service_stats_service
from app.services.stats_refresh_service import refresh_bot_visit_stat_for_date


async def _auth_owner(client: AsyncClient) -> dict[str, str]:
    r = await client.post(
        "/api/v1/auth/login",
        json={"email": "owner@example.com", "password": "secretpass12"},
        headers={"X-Test-Rate-Bucket": str(uuid.uuid4())},
    )
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.mark.asyncio
async def test_revenue_and_heatmap_aggregation(fake_now, client: AsyncClient, test_user_owner) -> None:
    """Две завершённые записи → выручка 90; heatmap одна ячейка."""
    factory = get_async_session_factory()
    d0 = fake_now.date()
    start = datetime(d0.year, d0.month, d0.day, 10, 30, tzinfo=UTC)
    async with factory() as s:
        salon = Salon(
            name="S",
            description={},
            timezone="UTC",
            currency="EUR",
            default_lang="en",
        )
        s.add(salon)
        await s.flush()
        m = Master(
            display_name="M1",
            bio={"en": "x", "ru": "", "uk": "", "bg": ""},
            specialization={"en": "s", "ru": "", "uk": "", "bg": ""},
            payroll_percent=Decimal("50.00"),
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
            name_i18n={"en": "Cut", "ru": "", "uk": "", "bg": ""},
            description_i18n={"en": "", "ru": "", "uk": "", "bg": ""},
            duration_minutes=60,
            price=Decimal("45.00"),
            is_active=True,
            sort_order=0,
        )
        s.add(svc)
        await s.flush()
        c1 = Client(
            tg_user_id=900001,
            lang="en",
            source=ClientSource.bot,
            total_revenue=Decimal("0"),
        )
        c2 = Client(
            tg_user_id=900002,
            lang="en",
            source=ClientSource.bot,
            total_revenue=Decimal("0"),
        )
        s.add_all([c1, c2])
        await s.flush()
        s.add_all(
            [
                Booking(
                    client_id=c1.id,
                    master_id=m.id,
                    service_id=svc.id,
                    starts_at=start,
                    ends_at=start + timedelta(hours=1),
                    status=BookingStatus.completed,
                    price=Decimal("40.00"),
                    prepayment_status=PrepaymentStatus.none,
                    created_via=BookingCreatedVia.bot,
                ),
                Booking(
                    client_id=c2.id,
                    master_id=m.id,
                    service_id=svc.id,
                    starts_at=start + timedelta(hours=3),
                    ends_at=start + timedelta(hours=4),
                    status=BookingStatus.completed,
                    price=Decimal("50.00"),
                    prepayment_status=PrepaymentStatus.none,
                    created_via=BookingCreatedVia.admin,
                ),
            ]
        )
        await s.commit()

    async with factory() as s:
        ov = await booking_stats_service.get_booking_overview(s, dfrom=d0, dto=d0)
        assert Decimal(ov["revenue"]) == Decimal("90.00")
        assert ov["completed_bookings"] == 2
        hm = await booking_stats_service.get_heatmap(s, dfrom=d0, dto=d0)
        assert sum(c["count"] for c in hm) == 2
        top = await service_stats_service.top_services_by_revenue(s, dfrom=d0, dto=d0, limit=5)
        assert len(top) == 1
        assert top[0]["revenue"] == "90.00"
        masters = await master_stats_service.list_master_stats(s, dfrom=d0, dto=d0)
        assert len(masters) == 1
        assert masters[0]["revenue"] == "90.00"
        assert masters[0]["payroll_amount"] == "45.00"


@pytest.mark.asyncio
async def test_bot_visit_stat_refresh_and_api(fake_now, client: AsyncClient, test_user_owner) -> None:
    factory = get_async_session_factory()
    d0 = fake_now.date()
    async with factory() as s:
        c = Client(tg_user_id=910001, lang="en", source=ClientSource.bot, joined_at=fake_now)
        s.add(c)
        await s.commit()

    async with factory() as s:
        await refresh_bot_visit_stat_for_date(s, d0)
        await s.commit()

    h = await _auth_owner(client)
    r = await client.get(
        f"/api/v1/stats/bot?from={d0.isoformat()}&to={d0.isoformat()}",
        headers=h,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["stats"]["new_joins"] >= 1


@pytest.mark.asyncio
async def test_master_can_access_stats_overview_but_not_bot(
    client: AsyncClient, test_user_master
) -> None:
    """Master видит обзор статистики (автоматически по своему master_id), но «Бот» вкладка скрыта."""
    factory = get_async_session_factory()
    # Привязать master профиль к user — без него /stats/overview вернёт 403
    async with factory() as s:
        m = Master(display_name="Master")
        s.add(m)
        await s.flush()
        from app.models.user import User as UserModel
        u = await s.get(UserModel, test_user_master)
        assert u is not None
        u.master_id = m.id
        await s.commit()

    r = await client.post(
        "/api/v1/auth/login",
        json={"email": "master@example.com", "password": "secretpass12"},
        headers={"X-Test-Rate-Bucket": str(uuid.uuid4())},
    )
    assert r.status_code == 200
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    d = date.today().isoformat()

    res_overview = await client.get(
        f"/api/v1/stats/overview?from={d}&to={d}",
        headers=h,
    )
    assert res_overview.status_code == 200

    res_bot = await client.get(
        f"/api/v1/stats/bot?from={d}&to={d}",
        headers=h,
    )
    assert res_bot.status_code == 403
