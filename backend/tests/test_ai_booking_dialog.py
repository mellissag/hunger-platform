"""AI booking dialog helpers."""

from __future__ import annotations

from app.services.ai_booking_dialog import (
    BOOKING_MESSAGES,
    _category_emoji,
    _format_date_button,
    _is_cancel_command,
    _norm_lang,
    in_active_booking_dialog,
)


def test_booking_messages_all_langs() -> None:
    for lang in ("ru", "en", "uk", "bg"):
        assert "select_category" in BOOKING_MESSAGES[lang]
        assert "confirm_yes" in BOOKING_MESSAGES[lang]


def test_category_emoji_mapping() -> None:
    assert "💅" in _category_emoji("Маникюр")
    assert "✂️" in _category_emoji("Волосы")
    assert _category_emoji("SPA zone") == ""


def test_cancel_commands() -> None:
    assert _is_cancel_command("отмена")
    assert _is_cancel_command("cancel")
    assert not _is_cancel_command("маникюр")


def test_in_active_booking_dialog() -> None:
    assert not in_active_booking_dialog(None)
    assert not in_active_booking_dialog({"state": "idle"})
    assert in_active_booking_dialog({"state": "selecting_service"})


def test_norm_lang() -> None:
    assert _norm_lang("en-US") == "en"
    assert _norm_lang("xx") == "ru"


def test_format_date_button_today() -> None:
    from datetime import date

    today = date(2026, 5, 27)
    label = _format_date_button(today, "ru", today)
    assert "Сегодня" in label
    assert "27" in label
