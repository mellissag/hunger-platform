"""Шаблоны сообщений бота на всех поддерживаемых языках."""

from __future__ import annotations

_SUPPORTED = ("ru", "en", "uk", "bg")

MESSAGES: dict[str, dict[str, str]] = {
    "booking_confirmed": {
        "ru": (
            "🎉 <b>Ваша запись подтверждена!</b>\n\n"
            "💆 Услуга: {service}\n"
            "👩‍🦰 Мастер: {master}\n"
            "📅 Дата: {date}\n\n"
            "Ждём вас! До встречи ✨"
        ),
        "en": (
            "🎉 <b>Your booking is confirmed!</b>\n\n"
            "💆 Service: {service}\n"
            "👩‍🦰 Master: {master}\n"
            "📅 Date: {date}\n\n"
            "We look forward to seeing you! ✨"
        ),
        "uk": (
            "🎉 <b>Ваш запис підтверджено!</b>\n\n"
            "💆 Послуга: {service}\n"
            "👩‍🦰 Майстер: {master}\n"
            "📅 Дата: {date}\n\n"
            "Чекаємо на вас! ✨"
        ),
        "bg": (
            "🎉 <b>Вашият час е потвърден!</b>\n\n"
            "💆 Услуга: {service}\n"
            "👩‍🦰 Майстор: {master}\n"
            "📅 Дата: {date}\n\n"
            "Очакваме ви! ✨"
        ),
    },
    "booking_rejected": {
        "ru": (
            "❌ <b>Запись отменена</b>\n\n"
            "💆 Услуга: {service}\n"
            "📅 Дата: {date}"
            "{reason_part}\n\n"
            "Вы можете записаться на другое удобное время."
        ),
        "en": (
            "❌ <b>Booking cancelled</b>\n\n"
            "💆 Service: {service}\n"
            "📅 Date: {date}"
            "{reason_part}\n\n"
            "You can book another convenient time."
        ),
        "uk": (
            "❌ <b>Запис скасовано</b>\n\n"
            "💆 Послуга: {service}\n"
            "📅 Дата: {date}"
            "{reason_part}\n\n"
            "Ви можете записатися на інший зручний час."
        ),
        "bg": (
            "❌ <b>Часът е отменен</b>\n\n"
            "💆 Услуга: {service}\n"
            "📅 Дата: {date}"
            "{reason_part}\n\n"
            "Можете да запазите друг удобен час."
        ),
    },
    "booking_rescheduled": {
        "ru": (
            "🔄 <b>Ваша запись перенесена</b>\n\n"
            "💆 Услуга: {service}\n"
            "👩‍🦰 Мастер: {master}\n"
            "📅 Новое время: {date}\n\n"
            "Ждём вас! ✨"
        ),
        "en": (
            "🔄 <b>Your booking has been rescheduled</b>\n\n"
            "💆 Service: {service}\n"
            "👩‍🦰 Master: {master}\n"
            "📅 New time: {date}\n\n"
            "See you soon! ✨"
        ),
        "uk": (
            "🔄 <b>Ваш запис перенесено</b>\n\n"
            "💆 Послуга: {service}\n"
            "👩‍🦰 Майстер: {master}\n"
            "📅 Новий час: {date}\n\n"
            "Чекаємо! ✨"
        ),
        "bg": (
            "🔄 <b>Вашият час е преместен</b>\n\n"
            "💆 Услуга: {service}\n"
            "👩‍🦰 Майстор: {master}\n"
            "📅 Нов час: {date}\n\n"
            "Очакваме ви! ✨"
        ),
    },
    "booking_reminder": {
        "ru": "⏰ Напоминаем: завтра в {time} — {service} с {master}. Ждём вас!",
        "en": "⏰ Reminder: tomorrow at {time} — {service} with {master}. See you soon!",
        "uk": "⏰ Нагадуємо: завтра о {time} — {service} з {master}. Чекаємо!",
        "bg": "⏰ Напомняме: утре в {time} — {service} с {master}. Очакваме ви!",
    },
    "consultation_received": {
        "ru": "📞 Ваша заявка принята. Мы свяжемся с вами для подбора мастера и времени.",
        "en": "📞 Your request has been received. We'll contact you to arrange a master and time.",
        "uk": "📞 Вашу заявку прийнято. Ми зв'яжемося з вами для вибору майстра та часу.",
        "bg": "📞 Вашата заявка е получена. Ще се свържем с вас за избор на майстор и час.",
    },
}


def get_message(key: str, lang: str, **kwargs: object) -> str:
    """Return a message template for the given key and language, with variables substituted."""
    resolved = lang if lang in _SUPPORTED else "ru"
    template = MESSAGES.get(key, {}).get(resolved) or MESSAGES.get(key, {}).get("ru", "")
    try:
        return template.format(**kwargs)
    except KeyError:
        return template
