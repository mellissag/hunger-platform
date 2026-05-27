"""Interactive AI booking dialog (Redis session + DB catalog + Groq intent)."""

from __future__ import annotations

import json
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import exists, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from redis.asyncio import Redis

import app.core.clock as clock

from app.core.exceptions import ClientBlacklistedError, SlotTakenError
from app.models.catalog import MasterService, Service, ServiceCategory, ServiceCategoryLink
from app.models.master import Master
from app.models.salon import Salon
from app.services import schedule_service
from app.services.ai_service import whatsapp_bot_llm_text
from app.services.bot_booking import create_ai_chat_booking, is_blacklisted
from app.services.booking_service import _resolve_pricing
from app.utils.datetime_utils import format_booking_datetime

SESSION_PREFIX = "ai_booking:"
SESSION_TTL_SEC = 30 * 60

BOOKING_MESSAGES: dict[str, dict[str, str]] = {
    "ru": {
        "start": "Отлично, запишем вас прямо здесь. Что вас интересует?",
        "select_category": "Что вас интересует?",
        "select_service": "Выберите услугу:",
        "select_master": "Выберите специалиста:",
        "select_date": "Выберите дату:",
        "select_time": "Свободное время {date}:",
        "master_auto": "Ваш специалист — {name}. Теперь выберите дату:",
        "confirm_text": (
            "Проверьте вашу запись:\n\nУслуга: {service}\nСпециалист: {master}\n"
            "Дата: {date} в {time}\nЦена: €{price}"
        ),
        "confirm_yes": "✓ Подтвердить",
        "confirm_no": "✕ Отмена",
        "done": (
            "Запись создана!\n\nЖдём вас {date} в {time}.\n"
            "{master} свяжется с вами для подтверждения."
        ),
        "cancelled": "Хорошо, начнём сначала. Напишите что вас интересует.",
        "no_slots": (
            "К сожалению, свободных слотов нет в ближайшие дни. "
            "Попробуйте выбрать другого специалиста или обратитесь к администратору."
        ),
        "any_master": "Любой свободный",
        "show_more": "Показать ещё...",
        "today": "Сегодня",
        "tomorrow": "Завтра",
    },
    "en": {
        "start": "Great, let's book you right here. What are you interested in?",
        "select_category": "What are you interested in?",
        "select_service": "Choose a service:",
        "select_master": "Choose a specialist:",
        "select_date": "Choose a date:",
        "select_time": "Available times on {date}:",
        "master_auto": "Your specialist is {name}. Now choose a date:",
        "confirm_text": (
            "Please review your booking:\n\nService: {service}\nSpecialist: {master}\n"
            "Date: {date} at {time}\nPrice: €{price}"
        ),
        "confirm_yes": "✓ Confirm",
        "confirm_no": "✕ Cancel",
        "done": (
            "Booking confirmed!\n\nSee you on {date} at {time}.\n"
            "{master} will contact you to confirm."
        ),
        "cancelled": "No problem, let's start over. What can I help you with?",
        "no_slots": (
            "Unfortunately there are no available slots in the coming days. "
            "Try choosing a different specialist or contact our administrator."
        ),
        "any_master": "Any available",
        "show_more": "Show more...",
        "today": "Today",
        "tomorrow": "Tomorrow",
    },
    "bg": {
        "start": "Чудесно, ще ви запишем директно тук. Какво ви интересува?",
        "select_category": "Какво ви интересува?",
        "select_service": "Изберете услуга:",
        "select_master": "Изберете специалист:",
        "select_date": "Изберете дата:",
        "select_time": "Свободни часове на {date}:",
        "master_auto": "Вашият специалист е {name}. Изберете дата:",
        "confirm_text": (
            "Проверете вашия час:\n\nУслуга: {service}\nСпециалист: {master}\n"
            "Дата: {date} в {time}\nЦена: €{price}"
        ),
        "confirm_yes": "✓ Потвърди",
        "confirm_no": "✕ Откажи",
        "done": (
            "Часът е записан!\n\nОчакваме ви на {date} в {time}.\n"
            "{master} ще се свърже с вас за потвърждение."
        ),
        "cancelled": "Добре, започваме отначало. Как мога да ви помогна?",
        "no_slots": (
            "За съжаление няма свободни часове в близките дни. "
            "Опитайте с друг специалист или се свържете с администратора."
        ),
        "any_master": "Всеки свободен",
        "show_more": "Покажи още...",
        "today": "Днес",
        "tomorrow": "Утре",
    },
    "uk": {
        "start": "Чудово, запишемо вас прямо тут. Що вас цікавить?",
        "select_category": "Що вас цікавить?",
        "select_service": "Оберіть послугу:",
        "select_master": "Оберіть спеціаліста:",
        "select_date": "Оберіть дату:",
        "select_time": "Вільний час {date}:",
        "master_auto": "Ваш спеціаліст — {name}. Тепер оберіть дату:",
        "confirm_text": (
            "Перевірте ваш запис:\n\nПослуга: {service}\nСпеціаліст: {master}\n"
            "Дата: {date} о {time}\nЦіна: €{price}"
        ),
        "confirm_yes": "✓ Підтвердити",
        "confirm_no": "✕ Скасувати",
        "done": (
            "Запис створено!\n\nЧекаємо вас {date} о {time}.\n"
            "{master} зв'яжеться з вами для підтвердження."
        ),
        "cancelled": "Гаразд, починаємо спочатку. Чим можу допомогти?",
        "no_slots": (
            "На жаль, вільних слотів найближчими днями немає. "
            "Спробуйте обрати іншого спеціаліста або зверніться до адміністратора."
        ),
        "any_master": "Будь-який вільний",
        "show_more": "Показати більше...",
        "today": "Сьогодні",
        "tomorrow": "Завтра",
    },
}

_WEEKDAY_RU = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"]
_WEEKDAY_EN = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
_WEEKDAY_UK = ["понеділок", "вівторок", "середа", "четвер", "п'ятниця", "субота", "неділя"]
_WEEKDAY_BG = ["понеделник", "вторник", "сряда", "четвъртък", "петък", "събота", "неделя"]

_MONTHS_RU = [
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
]
_MONTHS_UK = [
    "січня", "лютого", "березня", "квітня", "травня", "червня",
    "липня", "серпня", "вересня", "жовтня", "листопада", "грудня",
]
_MONTHS_BG = [
    "януари", "февруари", "март", "април", "май", "юни",
    "юли", "август", "септември", "октомври", "ноември", "декември",
]


def _msg(lang: str, key: str, **kwargs: str) -> str:
    l = lang if lang in BOOKING_MESSAGES else "ru"
    template = BOOKING_MESSAGES[l].get(key, BOOKING_MESSAGES["ru"].get(key, key))
    return template.format(**kwargs) if kwargs else template


def _norm_lang(lang: str | None) -> str:
    l = (lang or "ru").split("-")[0].lower()
    return l if l in ("en", "ru", "uk", "bg") else "ru"


def _session_key(session_id: str) -> str:
    return f"{SESSION_PREFIX}{session_id}"


def _default_session(lang: str, client_id: UUID | None) -> dict[str, Any]:
    return {
        "state": "idle",
        "selected_category_id": None,
        "selected_category_name": None,
        "selected_service_id": None,
        "selected_service_name": None,
        "selected_service_duration": None,
        "selected_service_price": None,
        "selected_master_id": None,
        "selected_master_name": None,
        "selected_date": None,
        "selected_time": None,
        "client_id": str(client_id) if client_id else None,
        "language": lang,
        "any_master": False,
        "service_offset": 0,
        "available_categories": [],
        "available_services": [],
        "available_masters": [],
        "available_dates": [],
        "available_slots": [],
        "master_pool": [],
    }


async def load_booking_session(redis: Redis | None, session_id: str) -> dict[str, Any] | None:
    if redis is None:
        return None
    raw = await redis.get(_session_key(session_id))
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


async def _session_save(redis: Redis | None, session_id: str, data: dict[str, Any]) -> None:
    if redis is None:
        return
    await redis.set(_session_key(session_id), json.dumps(data), ex=SESSION_TTL_SEC)


async def _session_clear(redis: Redis | None, session_id: str) -> None:
    if redis is None:
        return
    await redis.delete(_session_key(session_id))


def _is_cancel_command(text: str) -> bool:
    t = text.strip().lower()
    return t in (
        "отмена", "стоп", "cancel", "stop", "reset",
        "назад", "back", "скасувати", "отказ", "скасувати",
    )


def _category_emoji(name: str) -> str:
    n = name.lower()
    if any(x in n for x in ("маникюр", "педикюр", "ногт", "nail", "манікюр")):
        return "💅 "
    if any(x in n for x in ("волос", "стриж", "hair", "уклад", "фарб")):
        return "✂️ "
    if any(x in n for x in ("бров", "ресниц", "lash", "brow")):
        return "👁 "
    if any(x in n for x in ("лиц", "face", "уход", "догляд", "facial")):
        return "🧖 "
    if any(x in n for x in ("тел", "body", "массаж", "масаж")):
        return "✨ "
    return ""


def _pick_i18n(d: dict[str, Any] | None, lang: str) -> str:
    if not isinstance(d, dict):
        return ""
    for key in (lang, "ru", "en", "uk", "bg"):
        v = d.get(key)
        if isinstance(v, str) and v.strip():
            return v.strip()
    for v in d.values():
        if isinstance(v, str) and v.strip():
            return v.strip()
    return ""


async def _salon_tz(db: AsyncSession) -> str:
    row = await db.execute(select(Salon.timezone).limit(1))
    tz = row.scalar_one_or_none()
    return tz or "Europe/Sofia"


def _format_date_short(d: date, lang: str) -> str:
    if lang == "ru":
        return f"{d.day} {_MONTHS_RU[d.month - 1]}"
    if lang == "uk":
        return f"{d.day} {_MONTHS_UK[d.month - 1]}"
    if lang == "bg":
        return f"{d.day} {_MONTHS_BG[d.month - 1]}"
    return d.strftime("%B %d")


def _format_date_button(d: date, lang: str, today: date) -> str:
    short = _format_date_short(d, lang)
    if d == today:
        return f"{_msg(lang, 'today')}, {short}"
    if d == today + timedelta(days=1):
        return f"{_msg(lang, 'tomorrow')}, {short}"
    wd = d.weekday()
    if lang == "ru":
        return f"{_WEEKDAY_RU[wd].capitalize()}, {short}"
    if lang == "uk":
        return f"{_WEEKDAY_UK[wd].capitalize()}, {short}"
    if lang == "bg":
        return f"{_WEEKDAY_BG[wd].capitalize()}, {short}"
    return f"{_WEEKDAY_EN[wd]}, {short}"


async def _categories_with_active_services(db: AsyncSession) -> list[ServiceCategory]:
    link_exists = exists(
        select(1)
        .select_from(ServiceCategoryLink)
        .where(
            ServiceCategoryLink.category_id == ServiceCategory.id,
            ServiceCategoryLink.service_id == Service.id,
        )
    )
    svc_active = exists(
        select(1)
        .select_from(Service)
        .where(
            Service.is_active.is_(True),
            or_(Service.category_id == ServiceCategory.id, link_exists),
        )
    )
    rows = await db.execute(
        select(ServiceCategory)
        .where(svc_active)
        .order_by(ServiceCategory.sort_order)
    )
    return list(rows.scalars().all())


async def _services_for_category(db: AsyncSession, category_id: UUID) -> list[Service]:
    link_exists = exists(
        select(1)
        .select_from(ServiceCategoryLink)
        .where(
            ServiceCategoryLink.service_id == Service.id,
            ServiceCategoryLink.category_id == category_id,
        )
    )
    rows = await db.execute(
        select(Service)
        .where(
            Service.is_active.is_(True),
            or_(Service.category_id == category_id, link_exists),
        )
        .order_by(Service.sort_order)
    )
    return list(rows.scalars().all())


async def _masters_for_service(db: AsyncSession, service_id: UUID) -> list[Master]:
    q = (
        select(Master)
        .join(MasterService, MasterService.master_id == Master.id)
        .where(MasterService.service_id == service_id, Master.is_active.is_(True))
        .order_by(Master.sort_order, Master.display_name)
    )
    return list((await db.execute(q)).scalars().all())


async def _master_has_slots_within_days(
    db: AsyncSession,
    master_id: UUID,
    svc: Service,
    today: date,
    *,
    days: int = 7,
) -> bool:
    ctx = await schedule_service.get_schedule_context(db)
    for delta in range(days):
        d = today + timedelta(days=delta)
        if not await schedule_service.master_has_bookable_window_on_date(db, master_id, d, ctx):
            continue
        slots = await schedule_service.get_available_slots(
            db, master_id, d, svc.duration_minutes, apply_lead_time=True
        )
        if slots:
            return True
    return False


async def _pick_available_dates(
    db: AsyncSession,
    *,
    master_ids: list[UUID],
    svc: Service,
    today: date,
    max_dates: int = 7,
) -> list[date]:
    if not master_ids:
        return []
    ctx = await schedule_service.get_schedule_context(db)
    out: list[date] = []
    for delta in range(0, 60):
        d = today + timedelta(days=delta)
        found = False
        for mid in master_ids:
            if not await schedule_service.master_has_bookable_window_on_date(db, mid, d, ctx):
                continue
            slots = await schedule_service.get_available_slots(
                db, mid, d, svc.duration_minutes, apply_lead_time=True
            )
            if slots:
                found = True
                break
        if found:
            out.append(d)
            if len(out) >= max_dates:
                break
    return out


async def detect_booking_intent(db: AsyncSession, text: str) -> str:
    """BOOK | INFO | OTHER via Groq."""
    prompt = (
        f'The client sent: "{text[:800]}"\n'
        "Respond with only one word: BOOK (wants to book), "
        "INFO (question about prices/services/masters), OTHER."
    )
    try:
        raw = await whatsapp_bot_llm_text(
            db,
            system="You classify salon chat messages. Reply with exactly one word.",
            user_prompt=prompt,
            temperature=0.1,
        )
        word = raw.strip().upper().split()[0] if raw.strip() else "OTHER"
        if word.startswith("BOOK"):
            return "BOOK"
        if word.startswith("INFO"):
            return "INFO"
        return "OTHER"
    except Exception:  # noqa: BLE001
        t = text.lower()
        if any(
            x in t
            for x in ("запис", "book", "appointment", "хочу", "запиш", "запиши", "бронь")
        ):
            return "BOOK"
        if any(x in t for x in ("цен", "price", "сколько", "стоит", "прайс", "cost")):
            return "INFO"
        return "OTHER"


def _button(label: str, value: str) -> dict[str, str]:
    return {"label": label, "value": value}


async def _build_category_step(
    db: AsyncSession, sess: dict[str, Any], lang: str
) -> tuple[str, list[dict[str, str]]]:
    cats = await _categories_with_active_services(db)
    buttons: list[dict[str, str]] = []
    cat_meta: list[dict[str, str]] = []
    for c in cats:
        name = _pick_i18n(c.name_i18n if isinstance(c.name_i18n, dict) else {}, lang)
        emoji = _category_emoji(name)
        label = f"{emoji}{name}".strip() if emoji else name
        buttons.append(_button(label or "—", str(c.id)))
        cat_meta.append({"id": str(c.id), "name": name})
    sess["available_categories"] = cat_meta
    sess["state"] = "selecting_category"
    return _msg(lang, "select_category"), buttons


async def _build_service_step(
    db: AsyncSession, sess: dict[str, Any], lang: str
) -> tuple[str, list[dict[str, str]]]:
    cat_id = UUID(str(sess["selected_category_id"]))
    services = await _services_for_category(db, cat_id)
    offset = int(sess.get("service_offset") or 0)
    page = services[offset : offset + 8]
    buttons: list[dict[str, str]] = []
    svc_meta: list[dict[str, str]] = []
    dur_unit = "мин" if lang in ("ru", "uk", "bg") else "min"
    for s in page:
        name = _pick_i18n(s.name_i18n if isinstance(s.name_i18n, dict) else {}, lang)
        label = f"{name} — {s.duration_minutes} {dur_unit} — €{s.price}"
        buttons.append(_button(label, str(s.id)))
        svc_meta.append(
            {
                "id": str(s.id),
                "name": name,
                "duration": str(s.duration_minutes),
                "price": str(s.price),
            }
        )
    if offset + 8 < len(services):
        buttons.append(_button(_msg(lang, "show_more"), "more_services"))
    sess["available_services"] = [
        {
            "id": str(s.id),
            "name": _pick_i18n(s.name_i18n if isinstance(s.name_i18n, dict) else {}, lang),
            "duration": str(s.duration_minutes),
            "price": str(s.price),
        }
        for s in services
    ]
    sess["state"] = "selecting_service"
    return _msg(lang, "select_service"), buttons


async def _build_master_step(
    db: AsyncSession, sess: dict[str, Any], lang: str, today: date
) -> tuple[str, list[dict[str, str]], bool]:
    """Returns (response, buttons, auto_selected)."""
    svc = await db.get(Service, UUID(str(sess["selected_service_id"])))
    if svc is None:
        return _msg(lang, "cancelled"), [], False
    masters = await _masters_for_service(db, svc.id)
    available: list[Master] = []
    for m in masters:
        if await _master_has_slots_within_days(db, m.id, svc, today):
            available.append(m)
    if not available:
        sess["state"] = "idle"
        return _msg(lang, "no_slots"), [], False
    if len(available) == 1:
        m = available[0]
        sess["selected_master_id"] = str(m.id)
        sess["selected_master_name"] = m.display_name
        sess["any_master"] = False
        sess["master_pool"] = [str(m.id)]
        sess["state"] = "selecting_date"
        resp = _msg(lang, "master_auto", name=m.display_name)
        _, buttons = await _build_date_step(db, sess, lang, today)
        return resp, buttons, True
    buttons: list[dict[str, str]] = []
    master_meta: list[dict[str, str]] = []
    for m in available:
        rating = ""
        if m.rating_avg is not None:
            rating = f" ⭐ {float(m.rating_avg):.1f}"
        buttons.append(_button(f"{m.display_name}{rating}", str(m.id)))
        master_meta.append({"id": str(m.id), "name": m.display_name})
    buttons.append(_button(_msg(lang, "any_master"), "any_master"))
    sess["available_masters"] = master_meta
    sess["master_pool"] = [str(m.id) for m in available]
    sess["state"] = "selecting_master"
    return _msg(lang, "select_master"), buttons, False


async def _master_ids_from_sess(sess: dict[str, Any]) -> list[UUID]:
    if sess.get("any_master"):
        return [UUID(x) for x in (sess.get("master_pool") or [])]
    mid = sess.get("selected_master_id")
    return [UUID(str(mid))] if mid else []


async def _build_date_step(
    db: AsyncSession, sess: dict[str, Any], lang: str, today: date
) -> tuple[str, list[dict[str, str]]]:
    svc = await db.get(Service, UUID(str(sess["selected_service_id"])))
    if svc is None:
        return _msg(lang, "cancelled"), []
    master_ids = await _master_ids_from_sess(sess)
    dates = await _pick_available_dates(db, master_ids=master_ids, svc=svc, today=today, max_dates=7)
    if not dates:
        sess["state"] = "selecting_master" if sess.get("state") == "selecting_date" else sess.get("state")
        return _msg(lang, "no_slots"), []
    buttons = [_button(_format_date_button(d, lang, today), d.isoformat()) for d in dates]
    sess["available_dates"] = [d.isoformat() for d in dates]
    sess["state"] = "selecting_date"
    return _msg(lang, "select_date"), buttons


async def _build_time_step(
    db: AsyncSession, sess: dict[str, Any], lang: str
) -> tuple[str, list[dict[str, str]]]:
    svc = await db.get(Service, UUID(str(sess["selected_service_id"])))
    if svc is None or not sess.get("selected_date"):
        return _msg(lang, "cancelled"), []
    day = date.fromisoformat(str(sess["selected_date"]))
    master_ids = await _master_ids_from_sess(sess)
    combined: list[tuple[str, str]] = []
    for mid in master_ids:
        slots = await schedule_service.get_available_slots(
            db, mid, day, svc.duration_minutes, apply_lead_time=True
        )
        for tm in slots:
            val = f"{tm.strftime('%H:%M')}|{mid}"
            combined.append((tm.strftime("%H:%M"), val))
    combined.sort(key=lambda x: x[0])
    if not combined:
        sess["state"] = "selecting_date"
        return _msg(lang, "no_slots"), []
    buttons = [_button(label, val) for label, val in combined[:24]]
    sess["available_slots"] = [{"label": lb, "value": v} for lb, v in combined[:24]]
    sess["state"] = "selecting_time"
    date_label = _format_date_short(day, lang)
    return _msg(lang, "select_time", date=date_label), buttons


async def _build_confirm_step(
    db: AsyncSession, sess: dict[str, Any], lang: str, tz_name: str
) -> tuple[str, list[dict[str, str]]]:
    svc_name = sess.get("selected_service_name") or "—"
    master_name = sess.get("selected_master_name") or "—"
    day = date.fromisoformat(str(sess["selected_date"]))
    tm_str = str(sess["selected_time"])
    h, m = (int(x) for x in tm_str.split(":"))
    z = ZoneInfo(tz_name)
    starts_local = datetime.combine(day, time(h, m), tzinfo=z)
    when = format_booking_datetime(starts_local.astimezone(UTC), lang, tz_name)
    date_part = when.split(",")[0] if "," in when else _format_date_short(day, lang)
    time_part = tm_str
    price = sess.get("selected_service_price") or "0"
    text = _msg(
        lang,
        "confirm_text",
        service=str(svc_name),
        master=str(master_name),
        date=date_part,
        time=time_part,
        price=str(price),
    )
    sess["state"] = "confirming"
    return text, [
        _button(_msg(lang, "confirm_yes"), "confirm_yes"),
        _button(_msg(lang, "confirm_no"), "confirm_no"),
    ]


async def _create_booking_from_sess(
    db: AsyncSession,
    sess: dict[str, Any],
    client_id: UUID,
    *,
    telegram_bot: Any | None = None,
) -> str:
    lang = _norm_lang(sess.get("language"))
    tz_name = await _salon_tz(db)
    svc_id = UUID(str(sess["selected_service_id"]))
    mid = UUID(str(sess["selected_master_id"]))
    day = date.fromisoformat(str(sess["selected_date"]))
    tm_str = str(sess["selected_time"])
    h, mi = (int(x) for x in tm_str.split(":"))
    z = ZoneInfo(tz_name)
    starts_local = datetime.combine(day, time(h, mi), tzinfo=z)
    starts_utc = starts_local.astimezone(UTC)
    if await is_blacklisted(db, client_id):
        raise ClientBlacklistedError("Client is blacklisted")
    booking = await create_ai_chat_booking(
        db,
        client_id=client_id,
        master_id=mid,
        service_id=svc_id,
        starts_at=starts_utc,
        telegram_bot=telegram_bot,
    )
    master = await db.get(Master, mid)
    master_name = master.display_name if master else "—"
    when = format_booking_datetime(starts_utc, lang, tz_name)
    parts = when.split(",")
    date_part = parts[0].strip() if parts else _format_date_short(day, lang)
    time_part = tm_str
    return _msg(
        lang,
        "done",
        date=date_part,
        time=time_part,
        master=master_name,
    )


async def handle_booking_dialog(
    session_id: str,
    user_message: str,
    client_id: UUID | None,
    language: str,
    db: AsyncSession,
    redis: Redis | None,
    *,
    telegram_bot: Any | None = None,
    force_start: bool = False,
) -> dict[str, Any]:
    """
    Process one user message in the booking dialog.
    Returns {"response": str, "buttons": list, "booking_state": str}.
    """
    lang = _norm_lang(language)
    text = (user_message or "").strip()

    if _is_cancel_command(text):
        await _session_clear(redis, session_id)
        return {
            "response": _msg(lang, "cancelled"),
            "buttons": [],
            "booking_state": "idle",
        }

    sess = await load_booking_session(redis, session_id) or _default_session(lang, client_id)
    sess["language"] = lang
    if client_id is not None:
        sess["client_id"] = str(client_id)

    tz_name = await _salon_tz(db)
    z = ZoneInfo(tz_name)
    today = clock.utc_now().astimezone(z).date()

    state = str(sess.get("state") or "idle")

    if force_start and state == "idle":
        sess = _default_session(lang, client_id)
        sess["language"] = lang
        if client_id is not None:
            sess["client_id"] = str(client_id)
        resp, buttons = await _build_category_step(db, sess, lang)
        await _session_save(redis, session_id, sess)
        return {
            "response": _msg(lang, "start") + "\n\n" + resp,
            "buttons": buttons,
            "booking_state": "selecting_category",
        }

    if state == "selecting_category":
        cat_ids = {c["id"] for c in sess.get("available_categories") or []}
        if text not in cat_ids:
            resp, buttons = await _build_category_step(db, sess, lang)
            await _session_save(redis, session_id, sess)
            return {"response": resp, "buttons": buttons, "booking_state": sess["state"]}
        for c in sess.get("available_categories") or []:
            if c.get("id") == text:
                sess["selected_category_id"] = text
                sess["selected_category_name"] = c.get("name")
                break
        sess["service_offset"] = 0
        resp, buttons = await _build_service_step(db, sess, lang)
        await _session_save(redis, session_id, sess)
        return {"response": resp, "buttons": buttons, "booking_state": sess["state"]}

    if state == "selecting_service":
        if text == "more_services":
            sess["service_offset"] = int(sess.get("service_offset") or 0) + 8
            resp, buttons = await _build_service_step(db, sess, lang)
            await _session_save(redis, session_id, sess)
            return {"response": resp, "buttons": buttons, "booking_state": sess["state"]}
        svc_ids = {s["id"] for s in sess.get("available_services") or []}
        if text not in svc_ids:
            resp, buttons = await _build_service_step(db, sess, lang)
            await _session_save(redis, session_id, sess)
            return {"response": resp, "buttons": buttons, "booking_state": sess["state"]}
        svc = await db.get(Service, UUID(text))
        if svc is None:
            resp, buttons = await _build_service_step(db, sess, lang)
            await _session_save(redis, session_id, sess)
            return {"response": resp, "buttons": buttons, "booking_state": sess["state"]}
        sess["selected_service_id"] = text
        sess["selected_service_name"] = _pick_i18n(
            svc.name_i18n if isinstance(svc.name_i18n, dict) else {}, lang
        )
        sess["selected_service_duration"] = svc.duration_minutes
        sess["selected_service_price"] = str(svc.price)
        resp, buttons, _auto = await _build_master_step(db, sess, lang, today)
        await _session_save(redis, session_id, sess)
        return {"response": resp, "buttons": buttons, "booking_state": sess["state"]}

    if state == "selecting_master":
        if text == "any_master":
            sess["any_master"] = True
            sess["selected_master_id"] = None
            sess["selected_master_name"] = _msg(lang, "any_master")
            resp, buttons = await _build_date_step(db, sess, lang, today)
            await _session_save(redis, session_id, sess)
            return {"response": resp, "buttons": buttons, "booking_state": sess["state"]}
        master_ids = {m["id"] for m in sess.get("available_masters") or []}
        if text not in master_ids:
            resp, buttons, _ = await _build_master_step(db, sess, lang, today)
            await _session_save(redis, session_id, sess)
            return {"response": resp, "buttons": buttons, "booking_state": sess["state"]}
        m = await db.get(Master, UUID(text))
        sess["selected_master_id"] = text
        sess["selected_master_name"] = m.display_name if m else "—"
        sess["any_master"] = False
        resp, buttons = await _build_date_step(db, sess, lang, today)
        await _session_save(redis, session_id, sess)
        return {"response": resp, "buttons": buttons, "booking_state": sess["state"]}

    if state == "selecting_date":
        date_vals = set(sess.get("available_dates") or [])
        if text not in date_vals:
            resp, buttons = await _build_date_step(db, sess, lang, today)
            await _session_save(redis, session_id, sess)
            return {"response": resp, "buttons": buttons, "booking_state": sess["state"]}
        sess["selected_date"] = text
        resp, buttons = await _build_time_step(db, sess, lang)
        await _session_save(redis, session_id, sess)
        return {"response": resp, "buttons": buttons, "booking_state": sess["state"]}

    if state == "selecting_time":
        slot_vals = {s["value"] for s in sess.get("available_slots") or []}
        if text not in slot_vals and "|" not in text:
            # allow plain HH:MM if unique
            matches = [s for s in sess.get("available_slots") or [] if s.get("label") == text]
            if len(matches) == 1:
                text = str(matches[0]["value"])
        if "|" in text:
            tm_part, mid_part = text.split("|", 1)
            sess["selected_time"] = tm_part
            sess["selected_master_id"] = mid_part
            m = await db.get(Master, UUID(mid_part))
            sess["selected_master_name"] = m.display_name if m else sess.get("selected_master_name")
            price, _dur = await _resolve_pricing(db, UUID(mid_part), UUID(str(sess["selected_service_id"])))
            sess["selected_service_price"] = str(price)
        elif text in slot_vals:
            for s in sess.get("available_slots") or []:
                if s.get("value") == text:
                    parts = text.split("|", 1)
                    sess["selected_time"] = parts[0]
                    if len(parts) > 1:
                        sess["selected_master_id"] = parts[1]
                        m = await db.get(Master, UUID(parts[1]))
                        sess["selected_master_name"] = m.display_name if m else "—"
                        price, _ = await _resolve_pricing(
                            db, UUID(parts[1]), UUID(str(sess["selected_service_id"]))
                        )
                        sess["selected_service_price"] = str(price)
                    break
        else:
            resp, buttons = await _build_time_step(db, sess, lang)
            await _session_save(redis, session_id, sess)
            return {"response": resp, "buttons": buttons, "booking_state": sess["state"]}
        resp, buttons = await _build_confirm_step(db, sess, lang, tz_name)
        await _session_save(redis, session_id, sess)
        return {"response": resp, "buttons": buttons, "booking_state": sess["state"]}

    if state == "confirming":
        if text == "confirm_no":
            await _session_clear(redis, session_id)
            return {
                "response": _msg(lang, "cancelled"),
                "buttons": [],
                "booking_state": "idle",
            }
        if text != "confirm_yes":
            resp, buttons = await _build_confirm_step(db, sess, lang, tz_name)
            await _session_save(redis, session_id, sess)
            return {"response": resp, "buttons": buttons, "booking_state": sess["state"]}
        cid_raw = sess.get("client_id") or (str(client_id) if client_id else None)
        if not cid_raw:
            await _session_clear(redis, session_id)
            return {
                "response": _msg(lang, "cancelled"),
                "buttons": [],
                "booking_state": "idle",
            }
        try:
            done_text = await _create_booking_from_sess(
                db, sess, UUID(str(cid_raw)), telegram_bot=telegram_bot
            )
        except ClientBlacklistedError:
            await _session_clear(redis, session_id)
            return {
                "response": _msg(lang, "no_slots"),
                "buttons": [],
                "booking_state": "idle",
            }
        except SlotTakenError:
            sess["state"] = "selecting_time"
            resp, buttons = await _build_time_step(db, sess, lang)
            await _session_save(redis, session_id, sess)
            return {
                "response": _msg(lang, "no_slots") + "\n" + resp,
                "buttons": buttons,
                "booking_state": sess["state"],
            }
        await _session_clear(redis, session_id)
        return {"response": done_text, "buttons": [], "booking_state": "done"}

    # idle / unknown — start category pick
    resp, buttons = await _build_category_step(db, sess, lang)
    await _session_save(redis, session_id, sess)
    return {"response": resp, "buttons": buttons, "booking_state": sess["state"]}


def in_active_booking_dialog(session_data: dict[str, Any] | None) -> bool:
    if not session_data:
        return False
    state = session_data.get("state")
    return state not in ("idle", "done", None)
