"""Клавиатуры сценария записи."""

from __future__ import annotations

from uuid import UUID

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from app.bot.fluent_i18n import format_message
from app.bot.keyboards.common import nav_keyboard


def flow_type_keyboard(locale: str) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = [
        [
            InlineKeyboardButton(
                text=format_message(locale, "booking-flow-master-first"),
                callback_data="book:flow:master",
            ),
        ],
        [
            InlineKeyboardButton(
                text=format_message(locale, "booking-flow-service-first"),
                callback_data="book:flow:service",
            ),
        ],
    ]
    rows.extend(nav_keyboard(locale, back_cb=None).inline_keyboard)
    return InlineKeyboardMarkup(inline_keyboard=rows)


def masters_list_keyboard(
    locale: str,
    items: list[tuple[UUID, str]],
    *,
    prefix: str,
    page: int = 0,
    page_size: int = 8,
) -> InlineKeyboardMarkup:
    start = page * page_size
    chunk = items[start : start + page_size]
    rows: list[list[InlineKeyboardButton]] = []
    for mid, title in chunk:
        rows.append(
            [
                InlineKeyboardButton(
                    text=title[:64],
                    callback_data=f"{prefix}:m:{mid}",
                )
            ]
        )
    nav_row: list[InlineKeyboardButton] = []
    if page > 0:
        nav_row.append(
            InlineKeyboardButton(
                text="◀",
                callback_data=f"{prefix}:mpage:{page - 1}",
            )
        )
    if start + page_size < len(items):
        nav_row.append(
            InlineKeyboardButton(
                text="▶",
                callback_data=f"{prefix}:mpage:{page + 1}",
            )
        )
    if nav_row:
        rows.append(nav_row)
    rows.extend(nav_keyboard(locale, back_cb="menu:main").inline_keyboard)
    return InlineKeyboardMarkup(inline_keyboard=rows)


def categories_keyboard(
    locale: str,
    items: list[tuple[UUID, str]],
) -> InlineKeyboardMarkup:
    rows = [
        [
            InlineKeyboardButton(
                text=title[:64],
                callback_data=f"book:cat:{cid}",
            )
        ]
        for cid, title in items
    ]
    rows.extend(nav_keyboard(locale, back_cb="menu:main").inline_keyboard)
    return InlineKeyboardMarkup(inline_keyboard=rows)


def services_list_keyboard(
    locale: str,
    items: list[tuple[UUID, str]],
    *,
    prefix: str,
    back_cb: str = "menu:main",
) -> InlineKeyboardMarkup:
    rows = [
        [
            InlineKeyboardButton(
                text=title[:64],
                callback_data=f"{prefix}:s:{sid}",
            )
        ]
        for sid, title in items
    ]
    rows.extend(nav_keyboard(locale, back_cb=back_cb).inline_keyboard)
    return InlineKeyboardMarkup(inline_keyboard=rows)


def time_slots_keyboard(
    locale: str,
    slots: list[tuple[str, bool]],
    *,
    page: int = 0,
    page_size: int = 8,
) -> InlineKeyboardMarkup:
    def _strike(text: str) -> str:
        # Telegram inline buttons don't support markdown formatting.
        # Use combining long stroke overlay for visual strike-through.
        return "".join(ch + "\u0336" for ch in text)

    start = page * page_size
    chunk = slots[start : start + page_size]
    rows: list[list[InlineKeyboardButton]] = []
    row: list[InlineKeyboardButton] = []
    for t, available in chunk:
        if available:
            row.append(InlineKeyboardButton(text=t, callback_data=f"book:time:{t}"))
        else:
            row.append(
                InlineKeyboardButton(
                    text=_strike(t),
                    callback_data=f"book:timex:{t}",
                )
            )
        if len(row) == 2:
            rows.append(row)
            row = []
    if row:
        rows.append(row)
    nav_row: list[InlineKeyboardButton] = []
    if page > 0:
        nav_row.append(
            InlineKeyboardButton(text="◀", callback_data=f"book:tpage:{page - 1}")
        )
    if start + page_size < len(slots):
        nav_row.append(
            InlineKeyboardButton(text="▶", callback_data=f"book:tpage:{page + 1}")
        )
    if nav_row:
        rows.append(nav_row)
    rows.extend(nav_keyboard(locale, back_cb="menu:main").inline_keyboard)
    return InlineKeyboardMarkup(inline_keyboard=rows)


def confirm_booking_keyboard(locale: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=format_message(locale, "booking-confirm-btn"),
                    callback_data="book:confirm:yes",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=format_message(locale, "booking-edit-btn"),
                    callback_data="book:confirm:edit",
                ),
                InlineKeyboardButton(
                    text=format_message(locale, "booking-cancel-btn"),
                    callback_data="book:confirm:cancel",
                ),
            ],
            *nav_keyboard(locale, back_cb="menu:main").inline_keyboard,
        ]
    )


def prepayment_keyboard(locale: str, amount: str, currency: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=format_message(
                        locale,
                        "booking-pay-btn",
                        {"amount": amount, "currency": currency},
                    ),
                    callback_data="book:pay:stub",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=format_message(locale, "booking-pay-onsite"),
                    callback_data="book:pay:onsite",
                ),
            ],
            *nav_keyboard(locale, back_cb="menu:main").inline_keyboard,
        ]
    )


def success_keyboard(locale: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=format_message(locale, "success-my-bookings"),
                    callback_data="menu:my",
                ),
                InlineKeyboardButton(
                    text=format_message(locale, "success-main-menu"),
                    callback_data="menu:main",
                ),
            ],
        ]
    )
