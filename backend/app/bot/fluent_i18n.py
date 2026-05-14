"""Загрузка Fluent и форматирование строк."""

from __future__ import annotations

import logging
from functools import lru_cache
from importlib import resources
from pathlib import Path
from typing import Any

from fluent.runtime import FluentBundle, FluentResource

LOCALES = ("en", "ru", "uk", "bg")
FALLBACK = "en"

logger = logging.getLogger(__name__)


def _texts_dir() -> Path:
    return Path(__file__).resolve().parent / "texts"


def _read_messages_ftl(loc: str) -> str:
    """Load FTL from installed package (wheel) or source tree next to this file."""
    rel = resources.files("app.bot") / "texts" / loc / "messages.ftl"
    try:
        return rel.read_text(encoding="utf-8")
    except (FileNotFoundError, OSError, TypeError, UnicodeDecodeError) as e:
        path = _texts_dir() / loc / "messages.ftl"
        try:
            return path.read_text(encoding="utf-8")
        except FileNotFoundError as e2:
            logger.error(
                "Fluent messages.ftl missing for locale=%s (package=%s, filesystem=%s): %s / %s",
                loc,
                rel,
                path,
                e,
                e2,
            )
            raise


@lru_cache
def _bundle_for_locale(locale: str) -> FluentBundle:
    loc = locale if locale in LOCALES else FALLBACK
    content = _read_messages_ftl(loc)
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
