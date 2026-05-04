from __future__ import annotations

from datetime import UTC, datetime
from zoneinfo import ZoneInfo


def ensure_aware(dt: datetime | str | None) -> datetime | None:
    """Return timezone-aware datetime in UTC when possible."""
    if dt is None:
        return None
    if isinstance(dt, str):
        dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def now_utc() -> datetime:
    """Current timezone-aware UTC datetime."""
    return datetime.now(tz=UTC)


def utc_to_local(dt: datetime, tz_name: str = "Europe/Sofia") -> datetime:
    """Convert UTC (or naive) datetime to the given salon timezone."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(ZoneInfo(tz_name))


_MONTHS_RU = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"]
_MONTHS_UK = ["січ", "лют", "бер", "кві", "тра", "чер", "лип", "сер", "вер", "жов", "лис", "гру"]
_MONTHS_BG = ["яну", "фев", "мар", "апр", "май", "юни", "юли", "авг", "сеп", "окт", "ное", "дек"]


def format_booking_datetime(
    dt: datetime, lang: str = "ru", tz_name: str = "Europe/Sofia"
) -> str:
    """Format booking datetime in the client's language and salon's local timezone.

    Examples: «5 мая, 14:30» (ru), «5 May, 14:30» (en).
    """
    local_dt = utc_to_local(dt, tz_name)
    month_idx = local_dt.month - 1
    time_str = local_dt.strftime("%H:%M")

    if lang == "ru":
        return f"{local_dt.day} {_MONTHS_RU[month_idx]}, {time_str}"
    if lang == "uk":
        return f"{local_dt.day} {_MONTHS_UK[month_idx]}, {time_str}"
    if lang == "bg":
        return f"{local_dt.day} {_MONTHS_BG[month_idx]}, {time_str}"
    # en fallback
    month_name = local_dt.strftime("%B")
    return f"{local_dt.day} {month_name}, {time_str}"
