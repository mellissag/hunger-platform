"""Inline-календарь (месяц ±2 от текущего)."""

from __future__ import annotations

from calendar import monthcalendar
from datetime import date, timedelta

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from app.bot.fluent_i18n import format_message


def _month_bounds(today: date, year: int, month: int) -> tuple[bool, bool]:
    """Можно ли листать назад/вперёд (±2 месяца от today)."""
    cur = date(today.year, today.month, 1)
    target = date(year, month, 1)
    min_m = date(cur.year, cur.month, 1) - timedelta(days=62)
    max_m = date(cur.year, cur.month, 1) + timedelta(days=62)
    prev_ok = target > min_m
    next_ok = target < max_m
    return prev_ok, next_ok


def month_calendar_keyboard(
    locale: str,
    today: date,
    year: int,
    month: int,
    days_with_slots: set[int],
) -> InlineKeyboardMarkup:
    prev_ok, next_ok = _month_bounds(today, year, month)
    header = f"{year}-{month:02d}"
    rows: list[list[InlineKeyboardButton]] = [
        [
            InlineKeyboardButton(
                text="◀" if prev_ok else " ",
                callback_data=f"book:cal:prev:{year}:{month}" if prev_ok else "book:cal:noop",
            ),
            InlineKeyboardButton(text=header, callback_data="book:cal:noop"),
            InlineKeyboardButton(
                text="▶" if next_ok else " ",
                callback_data=f"book:cal:next:{year}:{month}" if next_ok else "book:cal:noop",
            ),
        ]
    ]
    dow = ["M", "T", "W", "T", "F", "S", "S"]
    rows.append(
        [
            InlineKeyboardButton(text=dow[i], callback_data="book:cal:noop")
            for i in range(7)
        ]
    )
    for week in monthcalendar(year, month):
        line: list[InlineKeyboardButton] = []
        for d in week:
            if d == 0:
                line.append(InlineKeyboardButton(text=" ", callback_data="book:cal:noop"))
                continue
            day = date(year, month, d)
            if day < today:
                line.append(InlineKeyboardButton(text="·", callback_data="book:cal:noop"))
                continue
            has = d in days_with_slots
            label = str(d) if has else f"·{d}"
            if has:
                line.append(
                    InlineKeyboardButton(
                        text=label,
                        callback_data=f"book:cal:pick:{day.isoformat()}",
                    )
                )
            else:
                line.append(InlineKeyboardButton(text="✕", callback_data="book:cal:noop"))
        rows.append(line)
    rows.append(
        [
            InlineKeyboardButton(
                text=format_message(locale, "nav-menu"),
                callback_data="menu:main",
            )
        ]
    )
    return InlineKeyboardMarkup(inline_keyboard=rows)


def default_calendar_month(today: date, offset: int = 0) -> tuple[int, int]:
    """offset месяцев от текущего."""
    y, m = today.year, today.month
    m += offset
    while m > 12:
        m -= 12
        y += 1
    while m < 1:
        m += 12
        y -= 1
    return y, m
