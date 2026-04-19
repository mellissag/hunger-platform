"""Middlewares бота."""

from app.bot.middlewares.db import DatabaseMiddleware
from app.bot.middlewares.i18n import LocaleMiddleware
from app.bot.middlewares.throttle import ThrottleMiddleware
from app.bot.middlewares.user import TgUserMiddleware

__all__ = [
    "DatabaseMiddleware",
    "LocaleMiddleware",
    "ThrottleMiddleware",
    "TgUserMiddleware",
]
