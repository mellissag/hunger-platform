"""Загрузка Fluent и форматирование строк."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

from fluent.runtime import FluentBundle, FluentResource

LOCALES = ("en", "ru", "uk", "bg")
FALLBACK = "en"


def _texts_dir() -> Path:
    return Path(__file__).resolve().parent / "texts"


@lru_cache
def _bundle_for_locale(locale: str) -> FluentBundle:
    loc = locale if locale in LOCALES else FALLBACK
    path = _texts_dir() / loc / "messages.ftl"
    content = path.read_text(encoding="utf-8")
    bundle = FluentBundle([loc])
    bundle.add_resource(FluentResource(content))
    return bundle


def format_message(locale: str, key: str, args: dict[str, Any] | None = None) -> str:
    """Форматирует сообщение Fluent; при ошибке — ключ."""
    bundle = _bundle_for_locale(locale)
    msg = bundle.get_message(key)
    if msg is None or msg.value is None:
        return key
    out, errs = bundle.format_pattern(msg.value, args or {})
    if errs:
        return key
    return str(out).strip()
