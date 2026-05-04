"""Telegram-бот (aiogram 3): Dispatcher, Router, middlewares."""

from __future__ import annotations

from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.fsm.storage.redis import RedisStorage

from app.bot.middlewares import (
    DatabaseMiddleware,
    LocaleMiddleware,
    ThrottleMiddleware,
    TgUserMiddleware,
)
from app.bot.routers import about, ai_consult, booking, language, master_bookings, my_bookings, profile, review, start
from app.config import Settings


def build_dispatcher(settings: Settings) -> Dispatcher:
    """FSM в Redis при REDIS_URL, иначе Memory (тесты)."""
    if settings.redis_url:
        storage = RedisStorage.from_url(
            settings.redis_url,
            state_ttl=7200,
            data_ttl=7200,
        )
    else:
        storage = MemoryStorage()

    dp = Dispatcher(storage=storage)
    dp.update.middleware(ThrottleMiddleware())
    dp.update.middleware(DatabaseMiddleware())
    dp.update.middleware(TgUserMiddleware())
    dp.update.middleware(LocaleMiddleware())

    dp.include_router(start.router)
    dp.include_router(master_bookings.router)
    dp.include_router(ai_consult.router)
    dp.include_router(language.router)
    dp.include_router(booking.router)
    dp.include_router(my_bookings.router)
    dp.include_router(review.router)
    dp.include_router(profile.router)
    dp.include_router(about.router)
    return dp


def build_bot(token: str) -> Bot:
    return Bot(token=token)
