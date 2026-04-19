"""Главное меню."""

from __future__ import annotations

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

from app.bot.fluent_i18n import format_message


def main_menu_keyboard(
    locale: str,
    *,
    ai_enabled: bool,
    prefers_no_ai: bool = False,
    mini_app_url: str | None = None,
) -> InlineKeyboardMarkup:
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
    if ai_enabled and not prefers_no_ai:
        rows.append(
            [
                InlineKeyboardButton(
                    text=format_message(locale, "menu-ai"),
                    callback_data="menu:ai",
                ),
            ]
        )
        rows.append(
            [
                InlineKeyboardButton(
                    text=format_message(locale, "menu-no-ai"),
                    callback_data="menu:no-ai",
                ),
            ]
        )
    if mini_app_url:
        rows.append(
            [
                InlineKeyboardButton(
                    text=format_message(locale, "menu-mini-app"),
                    web_app=WebAppInfo(url=mini_app_url),
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
