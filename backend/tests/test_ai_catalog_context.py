"""AI catalog context formatting."""

from __future__ import annotations

from app.services.ai_catalog_context import (
    _duration_label,
    _norm_lang,
    _pick_i18n,
)


def test_pick_i18n_prefers_lang() -> None:
    assert _pick_i18n({"en": "Haircut", "ru": "Стрижка"}, "ru") == "Стрижка"


def test_duration_label() -> None:
    assert "min" in _duration_label(60, "en")
    assert "мин" in _duration_label(60, "ru")


def test_norm_lang() -> None:
    assert _norm_lang("uk-UA") == "uk"
    assert _norm_lang("de") == "ru"
