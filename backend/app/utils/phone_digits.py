"""Normalize phone numbers to digits-only (E.164 without leading +)."""

from __future__ import annotations


def digits_only(value: str | None) -> str:
    if not value:
        return ""
    return "".join(ch for ch in str(value) if ch.isdigit())
