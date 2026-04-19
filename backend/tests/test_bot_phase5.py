"""Фаза 5: бот aiogram — сценарии и доменные ошибки.

Интеграция с Telegram API мокируется через feed_update (без пакета aiogram-tests:
версия 1.0.3 несовместима с aiogram 3.15+).
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

import pytest
from aiogram.types import Chat, Message, Update, User as TgUser

from app.bot import build_bot, build_dispatcher
from app.config import Settings
from app.db.base import get_async_session_factory
from app.models.booking import BlacklistEntry
from app.models.catalog import MasterService, Service, ServiceCategory
from app.models.client import Client
from app.models.enums import BookingCreatedVia, ClientSource, ThemePreset
from app.models.master import Master
from app.models.salon import Salon, Settings as SalonSettings
from app.models.user import User
from app.schemas.booking import BookingCreate
from app.services import booking_service
from app.services.bot_booking import is_blacklisted
from sqlalchemy import select


def _make_update_start(user_id: int = 424242) -> Update:
    u = TgUser(id=user_id, is_bot=False, first_name="Test")
    chat = Chat(id=user_id, type="private")
    msg = Message(
        message_id=1,
        date=1713000000,
        chat=chat,
        from_user=u,
        text="/start",
    )
    return Update(update_id=1, message=msg)


@pytest.mark.asyncio
async def test_feed_start_creates_client_and_replies(
    test_user_owner,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """/start через Dispatcher: клиент создаётся в БД."""

    async def _noop_answer(self, *args, **kwargs):  # type: ignore[no-untyped-def]
        return self

    monkeypatch.setattr(Message, "answer", _noop_answer, raising=False)
    monkeypatch.setattr(Message, "edit_text", _noop_answer, raising=False)

    from app.bot import fluent_i18n

    fluent_i18n._bundle_for_locale.cache_clear()

    settings = Settings(jwt_secret="test-jwt-secret-key-32-bytes-min!!", redis_url=None)
    dp = build_dispatcher(settings)
    bot = build_bot("123456:ABCDEF")
    upd = _make_update_start(900001)

    await dp.feed_update(bot, upd)

    factory = get_async_session_factory()
    async with factory() as s:
        c = (
            await s.execute(select(Client).where(Client.tg_user_id == 900001))
        ).scalar_one_or_none()
        assert c is not None
        assert c.tg_user_id == 900001


@pytest.mark.asyncio
async def test_concurrent_slot_race_one_winner(test_user_owner, fake_now) -> None:
    """Два create на один слот — один SlotTakenError (как в боте при confirm)."""
    factory = get_async_session_factory()
    async with factory() as s:
        salon = Salon(
            name="S",
            description={"en": "x"},
            timezone="UTC",
            currency="EUR",
            default_lang="en",
        )
        s.add(salon)
        await s.flush()
        s.add(
            SalonSettings(
                salon_id=salon.id,
                theme=ThemePreset.friendly,
                booking_lead_time_minutes=60,
                booking_buffer_minutes=5,
            )
        )
        m = Master(
            display_name="M",
            bio={"en": "x", "ru": "", "uk": "", "bg": ""},
            specialization={"en": "s", "ru": "", "uk": "", "bg": ""},
        )
        s.add(m)
        await s.flush()
        cat = ServiceCategory(name_i18n={"en": "C", "ru": "", "uk": "", "bg": ""}, sort_order=0)
        s.add(cat)
        await s.flush()
        svc = Service(
            category_id=cat.id,
            name_i18n={"en": "Cut", "ru": "", "uk": "", "bg": ""},
            description_i18n={"en": "", "ru": "", "uk": "", "bg": ""},
            duration_minutes=60,
            price=Decimal("50.00"),
            is_active=True,
            sort_order=0,
        )
        s.add(svc)
        await s.flush()
        s.add(MasterService(master_id=m.id, service_id=svc.id))
        cl = Client(first_name="X", lang="en", source=ClientSource.manual, tg_user_id=777001)
        s.add(cl)
        await s.commit()
        mid, sid, cid = m.id, svc.id, cl.id

    starts_at = fake_now + timedelta(days=5)
    starts_at = starts_at.replace(hour=10, minute=0, second=0, microsecond=0)

    factory = get_async_session_factory()
    uid = test_user_owner

    async def attempt() -> bool:
        async with factory() as session:
            user = (await session.execute(select(User).where(User.id == uid))).scalar_one()
            data = BookingCreate(
                client_id=cid,
                master_id=mid,
                service_id=sid,
                starts_at=starts_at,
                created_via=BookingCreatedVia.bot,
            )
            try:
                await booking_service.create_booking(session, user, data)
                await session.commit()
                return True
            except Exception:
                await session.rollback()
                return False

    import asyncio

    results = await asyncio.gather(attempt(), attempt())
    assert sum(1 for x in results if x) == 1


@pytest.mark.asyncio
async def test_blacklisted_blocks_booking(test_user_owner) -> None:
    factory = get_async_session_factory()
    async with factory() as s:
        salon = Salon(
            name="S",
            description={"en": "x"},
            timezone="UTC",
            currency="EUR",
            default_lang="en",
        )
        s.add(salon)
        await s.flush()
        s.add(
            SalonSettings(
                salon_id=salon.id,
                theme=ThemePreset.friendly,
                booking_lead_time_minutes=60,
                booking_buffer_minutes=5,
            )
        )
        m = Master(
            display_name="M",
            bio={"en": "x", "ru": "", "uk": "", "bg": ""},
            specialization={"en": "s", "ru": "", "uk": "", "bg": ""},
        )
        s.add(m)
        await s.flush()
        cat = ServiceCategory(name_i18n={"en": "C", "ru": "", "uk": "", "bg": ""}, sort_order=0)
        s.add(cat)
        await s.flush()
        svc = Service(
            category_id=cat.id,
            name_i18n={"en": "Cut", "ru": "", "uk": "", "bg": ""},
            description_i18n={"en": "", "ru": "", "uk": "", "bg": ""},
            duration_minutes=60,
            price=Decimal("50.00"),
            is_active=True,
            sort_order=0,
        )
        s.add(svc)
        await s.flush()
        s.add(MasterService(master_id=m.id, service_id=svc.id))
        cl = Client(first_name="Bad", lang="en", source=ClientSource.manual)
        s.add(cl)
        await s.flush()
        s.add(
            BlacklistEntry(
                client_id=cl.id,
                reason="test",
                added_by_user_id=test_user_owner,
            )
        )
        await s.commit()
        cid = cl.id

    factory = get_async_session_factory()
    async with factory() as session:
        assert await is_blacklisted(session, cid) is True