"""Главное меню."""

from __future__ import annotations

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from app.bot.fluent_i18n import format_message


def main_menu_keyboard(locale: str, *, ai_enabled: bool) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = [
        [
            InlineKeyboardButton(
                text=format_message(locale, "menu-book"),
                callback_data="menu:book",
            ),
        ],
        [
            InlineKeyboardButton(
                text=format_message(locale, "menu-my-bookings"),
                callback_data="menu:my",
            ),
        ],
    ]
    if ai_enabled:
        rows.append(
            [
                InlineKeyboardButton(
                    text=format_message(locale, "menu-ai"),
                    callback_data="menu:ai",
                ),
            ]
        )
    rows.extend(
        [
            [
                InlineKeyboardButton(
                    text=format_message(locale, "menu-about"),
                    callback_data="menu:about",
                ),
                InlineKeyboardButton(
                    text=format_message(locale, "menu-profile"),
                    callback_data="menu:profile",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=format_message(locale, "menu-lang"),
                    callback_data="menu:lang",
                ),
            ],
        ]
    )
    return InlineKeyboardMarkup(inline_keyboard=rows)
