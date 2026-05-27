"""AI booking dialog helpers."""

from __future__ import annotations

from app.services.ai_booking_dialog import (
    BOOKING_MESSAGES,
    _category_emoji,
    _filter_slots_by_preference,
    _format_date_button,
    _is_cancel_command,
    _map_lang_code,
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
    assert _norm_lang("bg") == "bg"
    assert _norm_lang("de") == "en"
    assert _norm_lang(None) == "ru"


def test_map_lang_code() -> None:
    assert _map_lang_code("bg-BG") == "bg"
    assert _map_lang_code("fr") == "en"


def test_filter_slots_evening() -> None:
    combined = [("09:00", "09:00|1"), ("18:00", "18:00|1"), ("19:30", "19:30|1")]
    out = _filter_slots_by_preference(combined, "evening")
    labels = [x[0] for x in out]
    assert "09:00" not in labels
    assert "18:00" in labels


def test_format_date_button_today() -> None:
    from datetime import date

    today = date(2026, 5, 27)
    label = _format_date_button(today, "ru", today)
    assert "Сегодня" in label
    assert "27" in label
