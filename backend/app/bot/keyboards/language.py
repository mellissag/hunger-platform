"""Выбор языка."""

from __future__ import annotations

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup


def language_keyboard(*, suggested: str | None) -> InlineKeyboardMarkup:
    def star(code: str, label: str) -> str:
        return f"⭐ {label}" if suggested == code else label

    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=star("en", "🇬🇧 English"),
                    callback_data="lang:set:en",
                ),
                InlineKeyboardButton(
                    text=star("ru", "🇷🇺 Русский"),
                    callback_data="lang:set:ru",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=star("uk", "🇺🇦 Українська"),
                    callback_data="lang:set:uk",
                ),
                InlineKeyboardButton(
                    text=star("bg", "🇧🇬 Български"),
                    callback_data="lang:set:bg",
                ),
            ],
        ]
    )
