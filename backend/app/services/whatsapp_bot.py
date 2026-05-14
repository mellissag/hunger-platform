"""WhatsApp AI booking dialog (Redis session + salon schedule + Gemini/Groq via ai_service)."""

from __future__ import annotations

import asyncio
import contextvars
import json
import logging
import re
from contextlib import suppress
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import app.core.clock as clock

from app.config import Settings, get_settings
from app.core.exceptions import ClientBlacklistedError, SlotTakenError
from app.models.booking import Booking
from app.models.catalog import MasterService, Service
from app.models.client import Client
from app.models.enums import BookingStatus, ClientSource
from app.models.master import Master
from app.models.salon import Salon
from app.services import schedule_service
from app.services.ai_service import AIUnavailableError, whatsapp_bot_llm_text
from app.services.bot_booking import cancel_tg_booking, create_wa_booking, is_blacklisted
from app.services.whatsapp import send_whatsapp_text_message
from app.services.whatsapp_bot_messages import wb_msg
from app.utils.datetime_utils import format_booking_datetime
from app.utils.phone_digits import digits_only

logger = logging.getLogger(__name__)

# Set while handling one inbound message: first outbound WhatsApp cancels delayed "loading" (STEP 7).
_first_wa_outbound: contextvars.ContextVar[asyncio.Event | None] = contextvars.ContextVar(
    "first_wa_outbound", default=None
)

SESSION_PREFIX = "whatsapp:session:"
SESSION_TTL_SEC = 30 * 60

VALID_STATES = frozenset(
    {
        "idle",
        "selecting_service",
        "selecting_master",
        "selecting_date",
        "selecting_time",
        "confirming",
        "cancel_pick",
        "done",
    }
)


def _session_key(phone_digits: str) -> str:
    return f"{SESSION_PREFIX}{phone_digits}"


def _default_session(lang: str) -> dict[str, Any]:
    return {
        "state": "idle",
        "selected_service_id": None,
        "selected_master_id": None,
        "any_master": False,
        "selected_date": None,
        "selected_time": None,
        "client_id": None,
        "master_pool": None,
        "dates_shown": [],
        "date_options": [],
        "language": lang,
        "last_activity": clock.utc_now().timestamp(),
    }


def _strip_json_fence(raw: str) -> str:
    t = raw.strip()
    if t.startswith("```"):
        t = re.sub(r"^```(?:json)?\s*", "", t, flags=re.IGNORECASE)
        t = re.sub(r"\s*```$", "", t)
    return t.strip()


async def _session_load(redis, phone_digits: str) -> dict[str, Any] | None:
    if redis is None:
        return None
    raw = await redis.get(_session_key(phone_digits))
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


async def _session_save(redis, phone_digits: str, data: dict[str, Any]) -> None:
    if redis is None:
        return
    data["last_activity"] = clock.utc_now().timestamp()
    await redis.set(_session_key(phone_digits), json.dumps(data), ex=SESSION_TTL_SEC)


async def _session_clear(redis, phone_digits: str) -> None:
    if redis is None:
        return
    await redis.delete(_session_key(phone_digits))


async def get_or_create_client_for_whatsapp_phone(db: AsyncSession, phone_digits: str) -> Client:
    """Resolve client by normalized phone; create placeholder if missing."""
    c = await _find_client_by_phone(db, phone_digits)
    if c:
        return c
    return await _ensure_client(db, phone_digits)


async def _find_client_by_phone(db: AsyncSession, phone_digits: str) -> Client | None:
    from sqlalchemy import func as sa_func, or_

    fd = sa_func.regexp_replace(sa_func.coalesce(Client.phone, ""), r"[^0-9]", "", "g")
    fwa = sa_func.regexp_replace(sa_func.coalesce(Client.whatsapp_phone, ""), r"[^0-9]", "", "g")
    return await db.scalar(select(Client).where(or_(fd == phone_digits, fwa == phone_digits)).limit(1))


async def _ensure_client(db: AsyncSession, phone_digits: str) -> Client:
    c = await _find_client_by_phone(db, phone_digits)
    if c:
        if not (c.whatsapp_phone or "").strip():
            c.whatsapp_phone = phone_digits
        return c
    c = Client(
        phone=phone_digits,
        whatsapp_phone=phone_digits,
        lang="en",
        source=ClientSource.bot,
    )
    db.add(c)
    await db.flush()
    return c


async def _reply(
    db: AsyncSession,
    *,
    settings: Settings,
    to_phone: str,
    text: str,
    client_id: UUID | None,
) -> None:
    evt = _first_wa_outbound.get()
    if evt is not None and not evt.is_set():
        evt.set()
    await send_whatsapp_text_message(
        db=db,
        to_phone_digits=to_phone,
        text=text,
        client_id=client_id,
        settings=settings,
    )


async def _stall_loading_if_silent(
    db: AsyncSession,
    *,
    settings: Settings,
    to_phone: str,
    lang: str,
    client_id: UUID | None,
) -> None:
    """If no outbound reply within 5s, send localized loading line (PHASE 59 STEP 7)."""
    evt = _first_wa_outbound.get()
    if evt is None:
        return
    try:
        await asyncio.wait_for(evt.wait(), timeout=5.0)
        return
    except asyncio.TimeoutError:
        pass
    if evt.is_set():
        return
    await send_whatsapp_text_message(
        db=db,
        to_phone_digits=to_phone,
        text=wb_msg("loading", lang),
        client_id=client_id,
        settings=settings,
    )


def _norm_lang(lang: str | None) -> str:
    l = (lang or "en").split("-")[0].lower()
    return l if l in ("en", "ru", "uk", "bg") else "en"


async def _detect_lang_ai(db: AsyncSession, text: str) -> str:
    system = 'Reply ONLY JSON: {"lang":"en"|"ru"|"uk"|"bg"} for the language of the user message.'
    try:
        raw = await whatsapp_bot_llm_text(db, system=system, user_prompt=text[:800], temperature=0.1)
        data = json.loads(_strip_json_fence(raw))
        if isinstance(data, dict):
            return _norm_lang(str(data.get("lang", "en")))
    except Exception:  # noqa: BLE001
        logger.debug("lang detect fallback", exc_info=True)
    return "en"


async def _intent_ai(db: AsyncSession, text: str, services_hint: str) -> dict[str, Any]:
    system = (
        "You are a salon assistant. Return ONLY valid JSON with keys: "
        'intent ("book"|"prices"|"schedule"|"cancel"|"other"), '
        "service_name (string or null if unknown). "
        f"Known service names (substring match allowed):\n{services_hint}\n"
        f'User message: "{text[:1200]}"'
    )
    raw = await whatsapp_bot_llm_text(
        db,
        system=system,
        user_prompt="Classify the message.",
        temperature=0.2,
    )
    data = json.loads(_strip_json_fence(raw))
    if not isinstance(data, dict):
        raise ValueError("bad intent json")
    return data


def _intent_keywords(text: str) -> dict[str, Any]:
    t = text.lower()
    if any(x in t for x in ("отмен", "cancel", "скас", "отказ")):
        return {"intent": "cancel", "service_name": None}
    if any(x in t for x in ("цен", "price", "сколько", "прайс")):
        return {"intent": "prices", "service_name": None}
    if any(x in t for x in ("расписан", "schedule", "график", "работ")):
        return {"intent": "schedule", "service_name": None}
    if any(
        x in t
        for x in (
            "запис",
            "book",
            "appointment",
            "час ",
            " час",
            "visit",
            "termin",
            "часа",
        )
    ):
        return {"intent": "book", "service_name": None}
    return {"intent": "other", "service_name": None}


def _is_reset_command(text: str) -> bool:
    t = text.strip().lower()
    return t in ("отмена", "стоп", "cancel", "stop", "reset", "скасувати", "отказ")


def _is_yes(text: str) -> bool:
    t = text.strip().lower()
    return t in ("да", "yes", "y", "ok", "ок", "sure", "так", "добре", "да")


def _is_no(text: str) -> bool:
    t = text.strip().lower()
    return t in ("нет", "no", "n", "ні", "не", "cancel")


async def _active_services(db: AsyncSession) -> list[Service]:
    rows = await db.execute(select(Service).where(Service.is_active.is_(True)).order_by(Service.sort_order))
    return list(rows.scalars().all())


async def _masters_for_service(db: AsyncSession, service_id: UUID) -> list[Master]:
    q = (
        select(Master)
        .join(MasterService, MasterService.master_id == Master.id)
        .where(MasterService.service_id == service_id)
        .order_by(Master.display_name)
    )
    return list((await db.execute(q)).scalars().all())


async def _pick_next_available_dates(
    db: AsyncSession,
    *,
    master_ids: list[UUID],
    svc: Service,
    today: date,
    exclude: set[date],
    max_dates: int,
) -> list[date]:
    if not master_ids:
        return []
    ctx = await schedule_service.get_schedule_context(db)
    out: list[date] = []
    for delta in range(0, 200):
        d = today + timedelta(days=delta)
        if d in exclude:
            continue
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


async def _salon_tz_currency(db: AsyncSession) -> tuple[str, str]:
    row = await db.execute(select(Salon).limit(1))
    s = row.scalar_one_or_none()
    return (s.timezone if s else "Europe/Sofia"), (s.currency if s else "EUR")


@dataclass
class WhatsappInboundResult:
    forwarded_to_admin: bool


async def process_inbound_text(
    *,
    db: AsyncSession,
    redis,
    phone_digits: str,
    text: str,
    client: Client | None,
    telegram_bot: Any | None,
) -> WhatsappInboundResult:
    """Handle one inbound WhatsApp text after `whatsapp_messages` row is flushed."""
    settings = get_settings()
    if not text.strip():
        return WhatsappInboundResult(forwarded_to_admin=False)

    client_row = client or await _find_client_by_phone(db, phone_digits)
    if client_row is not None:
        lang = _norm_lang(client_row.lang)
    else:
        lang = await _detect_lang_ai(db, text)

    first_evt = asyncio.Event()
    token = _first_wa_outbound.set(first_evt)
    stall_t = asyncio.create_task(
        _stall_loading_if_silent(
            db,
            settings=settings,
            to_phone=phone_digits,
            lang=lang,
            client_id=client_row.id if client_row else None,
        )
    )
    try:
        if await is_blacklisted(db, client_row.id) if client_row else False:
            await _reply(
                db,
                settings=settings,
                to_phone=phone_digits,
                text=wb_msg("ai_disabled", lang),
                client_id=client_row.id,
            )
            return WhatsappInboundResult(forwarded_to_admin=False)

        if _is_reset_command(text):
            await _session_clear(redis, phone_digits)
            await _reply(
                db,
                settings=settings,
                to_phone=phone_digits,
                text=wb_msg("session_reset", lang),
                client_id=client_row.id if client_row else None,
            )
            return WhatsappInboundResult(forwarded_to_admin=False)

        sess = await _session_load(redis, phone_digits) or _default_session(lang)
        sess["language"] = lang
        if client_row is not None:
            sess["client_id"] = str(client_row.id)
        state = str(sess.get("state") or "idle")
        if state not in VALID_STATES:
            state = "idle"
            sess["state"] = "idle"

        if state != "idle":
            client_row = client_row or await _ensure_client(db, phone_digits)
            await db.flush()
            sess["client_id"] = str(client_row.id)

        try:
            if state == "cancel_pick":
                assert client_row is not None
                return await _handle_cancel_pick(db, redis, settings, phone_digits, text, sess, client_row)
            if state == "idle":
                return await _handle_idle(db, redis, settings, phone_digits, text, sess, client_row, telegram_bot)
            if state == "selecting_service":
                return await _handle_selecting_service(
                    db, redis, settings, phone_digits, text, sess, client_row, telegram_bot
                )
            if state == "selecting_master":
                return await _handle_selecting_master(
                    db, redis, settings, phone_digits, text, sess, client_row, telegram_bot
                )
            if state == "selecting_date":
                return await _handle_selecting_date(
                    db, redis, settings, phone_digits, text, sess, client_row, telegram_bot
                )
            if state == "selecting_time":
                return await _handle_selecting_time(
                    db, redis, settings, phone_digits, text, sess, client_row, telegram_bot
                )
            if state == "confirming":
                return await _handle_confirming(
                    db, redis, settings, phone_digits, text, sess, client_row, telegram_bot
                )
        except AIUnavailableError:
            await _reply(
                db,
                settings=settings,
                to_phone=phone_digits,
                text=wb_msg("ai_disabled", lang),
                client_id=client_row.id if client_row else None,
            )
            return WhatsappInboundResult(forwarded_to_admin=False)
        except Exception:  # noqa: BLE001
            logger.exception("whatsapp bot error phone=%s", phone_digits[:6])
            await _reply(
                db,
                settings=settings,
                to_phone=phone_digits,
                text=wb_msg("unclear_retry", lang),
                client_id=client_row.id if client_row else None,
            )
            return WhatsappInboundResult(forwarded_to_admin=False)

        return WhatsappInboundResult(forwarded_to_admin=False)
    finally:
        first_evt.set()
        stall_t.cancel()
        with suppress(asyncio.CancelledError):
            await stall_t
        _first_wa_outbound.reset(token)


async def _handle_idle(
    db: AsyncSession,
    redis,
    settings: Settings,
    phone_digits: str,
    text: str,
    sess: dict[str, Any],
    client_row: Client | None,
    telegram_bot: Any | None,
) -> WhatsappInboundResult:
    lang = _norm_lang(sess["language"])
    services = await _active_services(db)
    hint = ", ".join(
        str((s.name_i18n or {}).get(lang) or (s.name_i18n or {}).get("en") or "?") for s in services[:40]
    )
    intent_data: dict[str, Any]
    try:
        intent_data = await _intent_ai(db, text, hint)
    except Exception:  # noqa: BLE001
        intent_data = _intent_keywords(text)

    intent = str(intent_data.get("intent") or "other").lower()
    svc_name_hint = intent_data.get("service_name")

    if intent == "other":
        await _reply(
            db,
            settings=settings,
            to_phone=phone_digits,
            text=wb_msg("forwarded_admin", lang),
            client_id=client_row.id if client_row else None,
        )
        return WhatsappInboundResult(forwarded_to_admin=True)

    c = client_row or await _ensure_client(db, phone_digits)
    await db.flush()

    if intent == "prices":
        tz, cur = await _salon_tz_currency(db)
        lines = [wb_msg("prices_header", lang)]
        for s in services[:25]:
            nm = str((s.name_i18n or {}).get(lang) or (s.name_i18n or {}).get("en") or "—")
            lines.append(f"• {nm} — {s.duration_minutes} min — {cur}{s.price}")
        await _reply(db, settings=settings, to_phone=phone_digits, text="\n".join(lines), client_id=c.id)
        await _session_clear(redis, phone_digits)
        return WhatsappInboundResult(forwarded_to_admin=False)

    if intent == "schedule":
        await _reply(
            db,
            settings=settings,
            to_phone=phone_digits,
            text=wb_msg("unclear_retry", lang) + "\n" + wb_msg("pick_service", lang),
            client_id=c.id,
        )
        return WhatsappInboundResult(forwarded_to_admin=False)

    if intent == "cancel":
        await _send_cancel_menu(db, redis, settings, phone_digits, lang, c.id)
        return WhatsappInboundResult(forwarded_to_admin=False)

    if intent != "book":
        return WhatsappInboundResult(forwarded_to_admin=True)

    if await is_blacklisted(db, c.id):
        await _reply(db, settings=settings, to_phone=phone_digits, text=wb_msg("ai_disabled", lang), client_id=c.id)
        return WhatsappInboundResult(forwarded_to_admin=False)

    matched: Service | None = None
    if isinstance(svc_name_hint, str) and svc_name_hint.strip():
        needle = svc_name_hint.strip().lower()
        for s in services:
            names = " ".join(str(v).lower() for v in (s.name_i18n or {}).values() if v)
            if needle in names:
                matched = s
                break

    if matched:
        sess["state"] = "selecting_master"
        sess["selected_service_id"] = str(matched.id)
        masters = await _masters_for_service(db, matched.id)
        if len(masters) == 1:
            sess["selected_master_id"] = str(masters[0].id)
            sess["any_master"] = False
            await _session_save(redis, phone_digits, sess)
            await _reply(db, settings=settings, to_phone=phone_digits, text=wb_msg("master_auto", lang), client_id=c.id)
            return await _begin_date_selection(
                db, redis, settings, phone_digits, sess, lang, c.id, reset_shown=True
            )
        sess["master_pool"] = [str(m.id) for m in masters]
        await _session_save(redis, phone_digits, sess)
        await _send_master_list(db, settings, phone_digits, lang, masters, c.id)
        return WhatsappInboundResult(forwarded_to_admin=False)

    sess["state"] = "selecting_service"
    await _session_save(redis, phone_digits, sess)
    await _send_service_list(db, settings, phone_digits, lang, services, c.id)
    return WhatsappInboundResult(forwarded_to_admin=False)


async def _send_service_list(
    db: AsyncSession,
    settings: Settings,
    phone: str,
    lang: str,
    services: list[Service],
    client_id: UUID,
) -> None:
    lines = [wb_msg("pick_service", lang)]
    for i, s in enumerate(services[:15], start=1):
        nm = str((s.name_i18n or {}).get(lang) or (s.name_i18n or {}).get("en") or "—")
        _, cur = await _salon_tz_currency(db)
        lines.append(f"{i}. {nm} — {s.duration_minutes} min — {cur}{s.price}")
    await _reply(db, settings=settings, to_phone=phone, text="\n".join(lines), client_id=client_id)


async def _send_master_list(
    db: AsyncSession,
    settings: Settings,
    phone: str,
    lang: str,
    masters: list[Master],
    client_id: UUID,
) -> None:
    lines = [wb_msg("pick_master", lang)]
    for i, m in enumerate(masters[:12], start=1):
        rating = ""
        if m.rating_avg is not None:
            rating = f" ⭐ {m.rating_avg}"
        lines.append(f"{i}. {m.display_name}{rating}")
    lines.append(wb_msg("master_any", lang))
    await _reply(db, settings=settings, to_phone=phone, text="\n".join(lines), client_id=client_id)


async def _handle_selecting_service(
    db: AsyncSession,
    redis,
    settings: Settings,
    phone: str,
    text: str,
    sess: dict[str, Any],
    client_row: Client,
    telegram_bot: Any | None,
) -> WhatsappInboundResult:
    lang = _norm_lang(sess["language"])
    services = await _active_services(db)
    pick = _parse_int_choice(text)
    if pick is None or pick < 1 or pick > len(services[:15]):
        await _reply(db, settings=settings, to_phone=phone, text=wb_msg("unclear_retry", lang), client_id=client_row.id)
        return WhatsappInboundResult(forwarded_to_admin=False)
    svc = services[pick - 1]
    sess["selected_service_id"] = str(svc.id)
    masters = await _masters_for_service(db, svc.id)
    if not masters:
        await _reply(db, settings=settings, to_phone=phone, text=wb_msg("no_slots_date", lang), client_id=client_row.id)
        await _session_clear(redis, phone)
        return WhatsappInboundResult(forwarded_to_admin=False)
    if len(masters) == 1:
        sess["selected_master_id"] = str(masters[0].id)
        sess["state"] = "selecting_date"
        sess["any_master"] = False
        await _session_save(redis, phone, sess)
        await _reply(db, settings=settings, to_phone=phone, text=wb_msg("master_auto", lang), client_id=client_row.id)
        return await _begin_date_selection(db, redis, settings, phone, sess, lang, client_row.id, reset_shown=True)
    sess["state"] = "selecting_master"
    sess["master_pool"] = [str(m.id) for m in masters]
    await _session_save(redis, phone, sess)
    await _send_master_list(db, settings, phone, lang, masters, client_row.id)
    return WhatsappInboundResult(forwarded_to_admin=False)


def _parse_int_choice(text: str) -> int | None:
    m = re.search(r"\b(\d{1,2})\b", text.strip())
    if not m:
        return None
    return int(m.group(1))


async def _handle_selecting_master(
    db: AsyncSession,
    redis,
    settings: Settings,
    phone: str,
    text: str,
    sess: dict[str, Any],
    client_row: Client,
    telegram_bot: Any | None,
) -> WhatsappInboundResult:
    lang = _norm_lang(sess["language"])
    pool_ids = [UUID(x) for x in (sess.get("master_pool") or [])]
    masters = [await db.get(Master, mid) for mid in pool_ids]
    masters = [m for m in masters if m is not None]
    tlow = text.strip().lower()
    if "люб" in tlow or tlow == "any" or "будь-як" in tlow or "кой да е" in tlow:
        sess["any_master"] = True
        sess["selected_master_id"] = None
        sess["state"] = "selecting_date"
        await _session_save(redis, phone, sess)
        return await _begin_date_selection(db, redis, settings, phone, sess, lang, client_row.id, reset_shown=True)
    pick = _parse_int_choice(text)
    if pick is None or pick < 1 or pick > len(masters):
        await _reply(db, settings=settings, to_phone=phone, text=wb_msg("unclear_retry", lang), client_id=client_row.id)
        return WhatsappInboundResult(forwarded_to_admin=False)
    m = masters[pick - 1]
    sess["selected_master_id"] = str(m.id)
    sess["any_master"] = False
    sess["state"] = "selecting_date"
    await _session_save(redis, phone, sess)
    return await _begin_date_selection(db, redis, settings, phone, sess, lang, client_row.id, reset_shown=True)


async def _begin_date_selection(
    db: AsyncSession,
    redis,
    settings: Settings,
    phone: str,
    sess: dict[str, Any],
    lang: str,
    client_id: UUID,
    *,
    reset_shown: bool = False,
) -> WhatsappInboundResult:
    svc = await db.get(Service, UUID(str(sess["selected_service_id"])))
    if svc is None:
        await _session_clear(redis, phone)
        return WhatsappInboundResult(forwarded_to_admin=False)
    tz, _ = await _salon_tz_currency(db)
    z = ZoneInfo(tz)
    today = clock.utc_now().astimezone(z).date()
    master_ids: list[UUID]
    if sess.get("any_master"):
        master_ids = [UUID(x) for x in (sess.get("master_pool") or [])]
    else:
        mid_raw = sess.get("selected_master_id")
        if not mid_raw:
            await _reply(db, settings=settings, to_phone=phone, text=wb_msg("no_slots_date", lang), client_id=client_id)
            return WhatsappInboundResult(forwarded_to_admin=False)
        master_ids = [UUID(str(mid_raw))]

    if reset_shown:
        sess["dates_shown"] = []
        sess["date_options"] = []

    shown_set: set[date] = set()
    for x in sess.get("dates_shown") or []:
        try:
            shown_set.add(date.fromisoformat(str(x)))
        except ValueError:
            continue

    candidates = await _pick_next_available_dates(
        db,
        master_ids=master_ids,
        svc=svc,
        today=today,
        exclude=shown_set,
        max_dates=4,
    )
    if not candidates:
        if not shown_set:
            await _reply(db, settings=settings, to_phone=phone, text=wb_msg("no_slots_date", lang), client_id=client_id)
        else:
            await _reply(db, settings=settings, to_phone=phone, text=wb_msg("no_more_dates", lang), client_id=client_id)
        return WhatsappInboundResult(forwarded_to_admin=False)

    sess["date_options"] = [d.isoformat() for d in candidates]
    ds = list(sess.get("dates_shown") or [])
    for d in candidates:
        iso = d.isoformat()
        if iso not in ds:
            ds.append(iso)
    sess["dates_shown"] = ds

    lines = [wb_msg("pick_date", lang)]
    for i, d in enumerate(candidates, start=1):
        lines.append(f"{i}. {format_booking_datetime(datetime.combine(d, time(12, 0), tzinfo=z), lang, tz)}")
    lines.append(f"5. {wb_msg('more_dates', lang)}")
    sess["state"] = "selecting_date"
    await _session_save(redis, phone, sess)
    await _reply(db, settings=settings, to_phone=phone, text="\n".join(lines), client_id=client_id)
    return WhatsappInboundResult(forwarded_to_admin=False)


async def _handle_selecting_date(
    db: AsyncSession,
    redis,
    settings: Settings,
    phone: str,
    text: str,
    sess: dict[str, Any],
    client_row: Client,
    telegram_bot: Any | None,
) -> WhatsappInboundResult:
    lang = _norm_lang(sess["language"])
    pick = _parse_int_choice(text)
    if pick == 5:
        await _session_save(redis, phone, sess)
        return await _begin_date_selection(db, redis, settings, phone, sess, lang, client_row.id, reset_shown=False)

    opts_raw = sess.get("date_options") or []
    opts: list[str] = [str(x) for x in opts_raw] if isinstance(opts_raw, list) else []
    if not opts:
        return await _begin_date_selection(db, redis, settings, phone, sess, lang, client_row.id, reset_shown=True)

    if pick is None or pick < 1 or pick > min(4, len(opts)):
        await _reply(db, settings=settings, to_phone=phone, text=wb_msg("unclear_retry", lang), client_id=client_row.id)
        return WhatsappInboundResult(forwarded_to_admin=False)

    svc = await db.get(Service, UUID(str(sess["selected_service_id"])))
    if svc is None:
        await _session_clear(redis, phone)
        return WhatsappInboundResult(forwarded_to_admin=False)

    master_ids = (
        [UUID(x) for x in (sess.get("master_pool") or [])]
        if sess.get("any_master")
        else [UUID(str(sess["selected_master_id"]))]
    )
    chosen = date.fromisoformat(opts[pick - 1])
    sess["selected_date"] = chosen.isoformat()
    sess["state"] = "selecting_time"
    await _session_save(redis, phone, sess)
    return await _send_time_slots(db, redis, settings, phone, sess, lang, client_row.id, svc, chosen, master_ids)


async def _send_time_slots(
    db: AsyncSession,
    redis,
    settings: Settings,
    phone: str,
    sess: dict[str, Any],
    lang: str,
    client_id: UUID,
    svc: Service,
    day: date,
    master_ids: list[UUID],
) -> WhatsappInboundResult:
    combined: list[tuple[time, UUID]] = []
    for mid in master_ids:
        slots = await schedule_service.get_available_slots(db, mid, day, svc.duration_minutes, apply_lead_time=True)
        for tm in slots[:24]:
            combined.append((tm, mid))
    combined.sort(key=lambda x: (x[0], str(x[1])))
    if not combined:
        await _reply(db, settings=settings, to_phone=phone, text=wb_msg("no_slots_date", lang), client_id=client_id)
        sess["state"] = "selecting_date"
        await _session_save(redis, phone, sess)
        return WhatsappInboundResult(forwarded_to_admin=False)
    lines = [wb_msg("pick_time", lang)]
    for i, (tm, mid) in enumerate(combined[:12], start=1):
        m = await db.get(Master, mid)
        label = f"{tm.strftime('%H:%M')}"
        if len(master_ids) > 1 and m:
            label += f" ({m.display_name})"
        lines.append(f"{i}. {label}")
    await _session_save(redis, phone, sess)
    await _reply(db, settings=settings, to_phone=phone, text="\n".join(lines), client_id=client_id)
    return WhatsappInboundResult(forwarded_to_admin=False)


async def _handle_selecting_time(
    db: AsyncSession,
    redis,
    settings: Settings,
    phone: str,
    text: str,
    sess: dict[str, Any],
    client_row: Client,
    telegram_bot: Any | None,
) -> WhatsappInboundResult:
    lang = _norm_lang(sess["language"])
    svc = await db.get(Service, UUID(str(sess["selected_service_id"])))
    if svc is None or not sess.get("selected_date"):
        await _session_clear(redis, phone)
        return WhatsappInboundResult(forwarded_to_admin=False)
    day = date.fromisoformat(str(sess["selected_date"]))
    master_ids = (
        [UUID(x) for x in (sess.get("master_pool") or [])]
        if sess.get("any_master")
        else [UUID(str(sess["selected_master_id"]))]
    )
    combined: list[tuple[time, UUID]] = []
    for mid in master_ids:
        slots = await schedule_service.get_available_slots(db, mid, day, svc.duration_minutes, apply_lead_time=True)
        for tm in slots:
            combined.append((tm, mid))
    combined.sort(key=lambda x: (x[0], str(x[1])))
    pick = _parse_int_choice(text)
    if pick is None or pick < 1 or pick > min(12, len(combined)):
        await _reply(db, settings=settings, to_phone=phone, text=wb_msg("unclear_retry", lang), client_id=client_row.id)
        return WhatsappInboundResult(forwarded_to_admin=False)
    tm, mid = combined[pick - 1]
    sess["selected_time"] = tm.strftime("%H:%M")
    sess["selected_master_id"] = str(mid)
    sess["state"] = "confirming"
    await _session_save(redis, phone, sess)
    m = await db.get(Master, mid)
    tz, cur = await _salon_tz_currency(db)
    z = ZoneInfo(tz)
    starts_local = datetime.combine(day, tm, tzinfo=z)
    when = format_booking_datetime(starts_local.astimezone(UTC), lang, tz)
    svc_name = str((svc.name_i18n or {}).get(lang) or (svc.name_i18n or {}).get("en") or "—")
    price, _duration = await _pricing(db, mid, svc.id)
    body = wb_msg(
        "confirm_prompt",
        lang,
        service=svc_name,
        master=m.display_name if m else "—",
        when=when,
        price=str(price),
        currency=cur,
    )
    await _reply(db, settings=settings, to_phone=phone, text=body, client_id=client_row.id)
    return WhatsappInboundResult(forwarded_to_admin=False)


async def _pricing(db: AsyncSession, master_id: UUID, service_id: UUID) -> tuple[Decimal, int]:
    from app.services.booking_service import _resolve_pricing  # noqa: PLC0415

    return await _resolve_pricing(db, master_id, service_id)


async def _handle_confirming(
    db: AsyncSession,
    redis,
    settings: Settings,
    phone: str,
    text: str,
    sess: dict[str, Any],
    client_row: Client,
    telegram_bot: Any | None,
) -> WhatsappInboundResult:
    lang = _norm_lang(sess["language"])
    if _is_no(text):
        await _session_clear(redis, phone)
        await _reply(db, settings=settings, to_phone=phone, text=wb_msg("session_reset", lang), client_id=client_row.id)
        return WhatsappInboundResult(forwarded_to_admin=False)
    if not _is_yes(text):
        await _reply(db, settings=settings, to_phone=phone, text=wb_msg("unclear_retry", lang), client_id=client_row.id)
        return WhatsappInboundResult(forwarded_to_admin=False)
    svc = await db.get(Service, UUID(str(sess["selected_service_id"])))
    if svc is None:
        await _session_clear(redis, phone)
        return WhatsappInboundResult(forwarded_to_admin=False)
    mid = UUID(str(sess["selected_master_id"]))
    day = date.fromisoformat(str(sess["selected_date"]))
    hh, mm = str(sess["selected_time"]).split(":")
    tz, _ = await _salon_tz_currency(db)
    z = ZoneInfo(tz)
    starts_local = datetime.combine(day, time(int(hh), int(mm)), tzinfo=z)
    starts_at = starts_local.astimezone(UTC)
    try:
        b = await create_wa_booking(
            db,
            client_id=client_row.id,
            master_id=mid,
            service_id=svc.id,
            starts_at=starts_at,
            telegram_bot=telegram_bot,
        )
    except SlotTakenError:
        await _reply(db, settings=settings, to_phone=phone, text=wb_msg("slot_taken", lang), client_id=client_row.id)
        sess["state"] = "selecting_time"
        await _session_save(redis, phone, sess)
        master_ids = [mid] if not sess.get("any_master") else [UUID(x) for x in (sess.get("master_pool") or [])]
        return await _send_time_slots(db, redis, settings, phone, sess, lang, client_row.id, svc, day, master_ids)
    except ClientBlacklistedError:
        await _reply(db, settings=settings, to_phone=phone, text=wb_msg("ai_disabled", lang), client_id=client_row.id)
        await _session_clear(redis, phone)
        return WhatsappInboundResult(forwarded_to_admin=False)

    m = await db.get(Master, b.master_id)
    await _reply(
        db,
        settings=settings,
        to_phone=phone,
        text=wb_msg("booking_created", lang, master=m.display_name if m else ""),
        client_id=client_row.id,
    )
    await _session_clear(redis, phone)
    sess["state"] = "done"
    await _session_save(redis, phone, sess)
    return WhatsappInboundResult(forwarded_to_admin=False)


async def _send_cancel_menu(
    db: AsyncSession,
    redis,
    settings: Settings,
    phone: str,
    lang: str,
    client_id: UUID,
) -> None:
    rows = await db.execute(
        select(Booking).where(
            Booking.client_id == client_id,
            Booking.status.in_((BookingStatus.pending, BookingStatus.confirmed)),
        )
    )
    books = list(rows.scalars().all())
    if not books:
        await _reply(db, settings=settings, to_phone=phone, text=wb_msg("no_active_bookings", lang), client_id=client_id)
        await _session_clear(redis, phone)
        return
    lines = [wb_msg("cancel_pick", lang)]
    tz, _ = await _salon_tz_currency(db)
    for i, b in enumerate(books[:8], start=1):
        when = format_booking_datetime(b.starts_at, lang, tz) if b.starts_at else "—"
        lines.append(f"{i}. {when}")
    sess = _default_session(lang)
    sess["state"] = "cancel_pick"
    sess["cancel_options"] = [str(b.id) for b in books[:8]]
    await _session_save(redis, phone, sess)
    await _reply(db, settings=settings, to_phone=phone, text="\n".join(lines), client_id=client_id)


async def _handle_cancel_pick(
    db: AsyncSession,
    redis,
    settings: Settings,
    phone: str,
    text: str,
    sess: dict[str, Any],
    client_row: Client,
) -> WhatsappInboundResult:
    lang = _norm_lang(sess["language"])
    opts = [UUID(x) for x in (sess.get("cancel_options") or [])]
    pick = _parse_int_choice(text)
    if pick is None or pick < 1 or pick > len(opts):
        await _reply(db, settings=settings, to_phone=phone, text=wb_msg("unclear_retry", lang), client_id=client_row.id)
        return WhatsappInboundResult(forwarded_to_admin=False)
    bid = opts[pick - 1]
    try:
        await cancel_tg_booking(db, client_id=client_row.id, booking_id=bid, reason="whatsapp client")
    except Exception:  # noqa: BLE001
        logger.exception("wa cancel failed")
        await _reply(db, settings=settings, to_phone=phone, text=wb_msg("unclear_retry", lang), client_id=client_row.id)
        return WhatsappInboundResult(forwarded_to_admin=False)
    await _reply(db, settings=settings, to_phone=phone, text=wb_msg("cancelled_ok", lang), client_id=client_row.id)
    await _session_clear(redis, phone)
    return WhatsappInboundResult(forwarded_to_admin=False)


# Webhook worker entrypoint name (same implementation as process_inbound_text).
handle_message = process_inbound_text
