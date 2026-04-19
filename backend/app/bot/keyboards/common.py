"""Навигация: Назад и Меню."""

from __future__ import annotations

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from app.bot.fluent_i18n import format_message


def nav_keyboard(locale: str, *, back_cb: str | None = None) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = []
    row: list[InlineKeyboardButton] = []
    if back_cb:
        row.append(
            InlineKeyboardButton(
                text=format_message(locale, "nav-back"),
                callback_data=back_cb,
            )
        )
    row.append(
        InlineKeyboardButton(
            text=format_message(locale, "nav-menu"),
            callback_data="menu:main",
        )
    )
    rows.append(row)
    return InlineKeyboardMarkup(inline_keyboard=rows)


def confirm_keyboard(locale: str, prefix: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=format_message(locale, "confirm-yes"),
                    callback_data=f"{prefix}:yes",
                ),
                InlineKeyboardButton(
                    text=format_message(locale, "confirm-no"),
                    callback_data=f"{prefix}:no",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=format_message(locale, "nav-menu"),
                    callback_data="menu:main",
                ),
            ],
        ]
    )
