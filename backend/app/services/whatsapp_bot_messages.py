"""Localized strings for WhatsApp booking bot (ru, en, uk, bg)."""

from __future__ import annotations

_LANGS = ("ru", "en", "uk", "bg")

_MESSAGES: dict[str, dict[str, str]] = {
    "loading": {
        "ru": "⏳ Секунду…",
        "en": "⏳ One moment…",
        "uk": "⏳ Зачекайте…",
        "bg": "⏳ Един момент…",
    },
    "session_reset": {
        "ru": "Хорошо, начнём сначала, когда будете готовы.",
        "en": "Alright — we can start fresh whenever you are ready.",
        "uk": "Добре, почнемо спочатку, коли будете готові.",
        "bg": "Добре — можем да започнем отначало, когато сте готови.",
    },
    "unclear_retry": {
        "ru": "Не совсем поняла. Уточните, пожалуйста, или напишите «отмена», чтобы начать заново.",
        "en": "I am not sure I understood. Please clarify, or type “cancel” to start over.",
        "uk": "Не зовсім зрозуміла. Уточніть або напишіть «скасувати», щоб почати спочатку.",
        "bg": "Не съм сигурна. Уточнете или напишете «отказ», за да започнем отначало.",
    },
    "ai_disabled": {
        "ru": "Помощник ИИ сейчас отключён в настройках салона. Напишите администратору через этот чат или позвоните в салон.",
        "en": "The AI assistant is disabled for this salon. Please contact the salon directly.",
        "uk": "Штучний інтелект вимкнено. Зверніться до адміністратора салону.",
        "bg": "AI асистентът е изключен. Свържете се със салона.",
    },
    "prices_header": {
        "ru": "Наши услуги и цены:",
        "en": "Our services and prices:",
        "uk": "Наші послуги та ціни:",
        "bg": "Нашите услуги и цени:",
    },
    "no_active_bookings": {
        "ru": "У вас нет активных записей для отмены.",
        "en": "You have no active bookings to cancel.",
        "uk": "У вас немає активних записів для скасування.",
        "bg": "Нямате активни часове за отмяна.",
    },
    "cancel_pick": {
        "ru": "Какую запись отменить? Ответьте номером:",
        "en": "Which booking should we cancel? Reply with the number:",
        "uk": "Який запис скасувати? Відповідайте номером:",
        "bg": "Кой час да отменим? Отговорете с номер:",
    },
    "cancelled_ok": {
        "ru": "Запись отменена.",
        "en": "Your booking has been cancelled.",
        "uk": "Запис скасовано.",
        "bg": "Часът е отменен.",
    },
    "forwarded_admin": {
        "ru": "Передала ваше сообщение администратору — скоро ответят.",
        "en": "I have passed your message to the team — someone will reply soon.",
        "uk": "Передала ваше повідомлення адміністратору.",
        "bg": "Предадох съобщението на екипа.",
    },
    "pick_service": {
        "ru": "Выберите услугу (ответьте цифрой):",
        "en": "Choose a service (reply with a number):",
        "uk": "Оберіть послугу (відповідь цифрою):",
        "bg": "Изберете услуга (с номер):",
    },
    "pick_master": {
        "ru": "Выберите специалиста:",
        "en": "Choose a specialist:",
        "uk": "Оберіть спеціаліста:",
        "bg": "Изберете специалист:",
    },
    "master_any": {
        "ru": 'Или напишите «любой» — подберём свободного.',
        "en": 'Or type “any” and we will pick the first available specialist.',
        "uk": 'Або напишіть «будь-який».',
        "bg": 'Или напишете „кой да е“.',
    },
    "master_auto": {
        "ru": "У этой услуги только один специалист — выбираю автоматически.",
        "en": "Only one specialist offers this service — selected automatically.",
        "uk": "Лише один спеціаліст — обрано автоматично.",
        "bg": "Само един специалист — избран автоматично.",
    },
    "pick_date": {
        "ru": "Ближайшие свободные даты:",
        "en": "Next available dates:",
        "uk": "Найближчі вільні дати:",
        "bg": "Следващи свободни дати:",
    },
    "more_dates": {
        "ru": "Показать больше дат",
        "en": "Show more dates",
        "uk": "Більше дат",
        "bg": "Още дати",
    },
    "pick_time": {
        "ru": "Свободное время:",
        "en": "Available times:",
        "uk": "Вільний час:",
        "bg": "Свободни часове:",
    },
    "no_slots_date": {
        "ru": "На эту дату нет свободных окон. Выберите другую дату или напишите «отмена».",
        "en": "No free slots on that day. Pick another date or type “cancel”.",
        "uk": "Немає вільних вікон. Оберіть іншу дату.",
        "bg": "Няма свободни часове. Изберете друга дата.",
    },
    "no_more_dates": {
        "ru": "Свободных дат больше не нашла в ближайшие месяцы. Напишите «отмена» или выберите другого мастера.",
        "en": "No more available dates found in the next months. Type “cancel” or pick another specialist.",
        "uk": "Більше вільних дат не знайшла. Спробуйте іншого майстра або «скасувати».",
        "bg": "Няма повече свободни дати. Изберете друг специалист или «отказ».",
    },
    "confirm_prompt": {
        "ru": "Проверьте вашу запись:\n\n💇 Услуга: {service}\n👩 Специалист: {master}\n📅 {when}\n💰 Цена: {price} {currency}\n\nПодтвердить? Ответьте «Да» или «Нет».",
        "en": "Please confirm:\n\n💇 Service: {service}\n👩 Specialist: {master}\n📅 {when}\n💰 Price: {price} {currency}\n\nReply “Yes” or “No”.",
        "uk": "Підтвердіть запис:\n\n💇 Послуга: {service}\n👩 Спеціаліст: {master}\n📅 {when}\n💰 Ціна: {price} {currency}\n\n«Так» чи «Ні».",
        "bg": "Потвърдете:\n\n💇 Услуга: {service}\n👩 Специалист: {master}\n📅 {when}\n💰 Цена: {price} {currency}\n\n„Да“ или „Не“.",
    },
    "booking_created": {
        "ru": "✅ Запись создана!\n\nЯ отправила вашу запись на подтверждение специалисту. Как только {master} подтвердит, перенесёт или отменит — я сразу пришлю вам ответ.\n\nДо встречи!",
        "en": "✅ Booking created!\n\nI sent it to {master} for confirmation. You will hear from us as soon as they confirm, reschedule, or cancel.\n\nSee you soon!",
        "uk": "✅ Запис створено!\n\nНадіслано {master} на підтвердження.",
        "bg": "✅ Часът е създаден!\n\nИзпратено на {master} за потвърждение.",
    },
    "slot_taken": {
        "ru": "К сожалению, это время только что заняли. Выберите другое.",
        "en": "That slot was just taken. Please pick another time.",
        "uk": "Цей час щойно зайняли. Оберіть інший.",
        "bg": "Часът вече е зает. Изберете друг.",
    },
    "status_confirmed": {
        "ru": "✅ Ваша запись подтверждена!\n\n{master} подтвердила вашу запись на {when}.\nЖдём вас!",
        "en": "✅ Your booking is confirmed!\n\n{master} confirmed your visit on {when}.\nWe look forward to seeing you!",
        "uk": "✅ Запис підтверджено!\n\n{master} — {when}.",
        "bg": "✅ Потвърдено!\n\n{master} — {when}.",
    },
    "status_cancelled": {
        "ru": "❌ Запись отменена\n\nК сожалению, ваша запись на {when} была отменена.\nХотите записаться на другое время? Просто напишите мне.",
        "en": "❌ Booking cancelled\n\nYour appointment on {when} was cancelled.\nWould you like another time? Just message me.",
        "uk": "❌ Запис скасовано\n\n{when}. Хочете інший час? Напишіть мені.",
        "bg": "❌ Отменено\n\n{when}. Искате друг час? Пишете ми.",
    },
    "status_rescheduled": {
        "ru": "🔄 Время записи изменено\n\nВаша запись перенесена на {when}.\nЕсли вас не устраивает — напишите мне, подберём другое время.",
        "en": "🔄 Your booking was moved\n\nNew time: {when}.\nIf that does not work, message me and we will find another slot.",
        "uk": "🔄 Час змінено\n\nНовий час: {when}.",
        "bg": "🔄 Променен час\n\n{when}.",
    },
}


def wb_msg(key: str, lang: str, **kwargs: str) -> str:
    """Return localized message; falls back to English then key."""
    l = (lang or "en").split("-")[0].lower()
    if l not in _LANGS:
        l = "en"
    row = _MESSAGES.get(key, {})
    template = row.get(l) or row.get("en") or key
    try:
        return template.format(**kwargs) if kwargs else template
    except Exception:
        return template
