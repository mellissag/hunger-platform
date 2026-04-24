from __future__ import annotations

from datetime import UTC, datetime


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
