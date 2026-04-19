"""Единая точка для «текущего времени» (тесты патчат `utc_now`)."""

from __future__ import annotations

from datetime import UTC, datetime


def utc_now() -> datetime:
    return datetime.now(tz=UTC)
