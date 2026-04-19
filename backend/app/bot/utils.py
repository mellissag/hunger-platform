"""Вспомогательные функции бота."""

from __future__ import annotations

import re
from typing import Any
from uuid import UUID

_RE_PHONE = re.compile(r"^\+?[1-9]\d{7,14}$")


def pick_i18n(blob: dict[str, Any] | None, locale: str, *, fallback: str = "en") -> str:
    if not blob:
        return ""
    v = blob.get(locale) or blob.get(fallback)
    if v is None and blob:
        v = next(iter(blob.values()), None)
    return str(v).strip() if v else ""


def normalize_phone(raw: str) -> str | None:
    s = raw.strip().replace(" ", "").replace("-", "")
    if s.startswith("00"):
        s = "+" + s[2:]
    if _RE_PHONE.match(s):
        return s if s.startswith("+") else f"+{s}"
    return None


def fmt_uuid(u: UUID | str) -> str:
    return str(u)
