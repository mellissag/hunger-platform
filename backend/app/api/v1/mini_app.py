"""Telegram Mini App — HMAC initData validation + public endpoints."""

from __future__ import annotations

import hashlib
import hmac
import os
import urllib.parse
import uuid
from datetime import timedelta
from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials
from jose import JWTError
from pydantic import BaseModel as _BM, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import Settings, get_settings
from app.core.security import decode_access_token, parse_access_payload
from app.deps import get_db, get_redis, security_bearer
from app.models.catalog import MasterService, Service
from app.models.client import Client
from app.models.enums import ClientSource
from app.models.master import Master
from app.schemas.mini_app import (
    InitDataPayload,
    MiniAppAvailabilityResponse,
    MiniAppBookingCreate,
    MiniAppBookingOut,
    MiniAppMasterOut,
    MiniAppServiceOut,
    MiniAppSlotsResponse,
)
from app.models.booking import Booking
from app.models.salon import Salon
from app.models.user import User
from app.services import schedule_service
from app.services.bot_booking import create_tg_booking, is_blacklisted
from app.services.notification_service import AdminEvent, get_admin_notify_chat_id, notify_admin
from app.services.notifications import notify_master_new_booking
from app.utils.datetime_utils import ensure_aware

router = APIRouter(prefix="/mini-app", tags=["mini-app"])


def _public_origin_for_media(request: Request) -> str:
    """Public origin for /media — align with upload.py (BASE_URL) so files resolve on the real API host."""
    explicit = (os.environ.get("BASE_URL") or "").strip().rstrip("/")
    if explicit:
        return explicit
    settings = get_settings()
    if settings.app_env in ("development", "test"):
        return str(request.base_url).rstrip("/")
    return f"https://{settings.app_domain}".rstrip("/")


def _resolve_mini_app_media_url(raw: str | None, request: Request) -> str | None:
    """Normalize relative paths and localhost absolute URLs so Telegram WebApp can load images."""
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    public = _public_origin_for_media(request)
    if s.startswith(("http://", "https://")):
        u = urllib.parse.urlparse(s)
        if u.hostname in ("127.0.0.1", "localhost", "0.0.0.0"):
            qs = f"?{u.query}" if u.query else ""
            return f"{public}{u.path}{qs}"
        return s
    path = s if s.startswith("/") else f"/{s}"
    return f"{public}{path}"


# ─── HMAC validation ───────────────────────────────────────────────────────────


def _parse_init_data(raw: str) -> dict[str, str]:
    """Parse URL-encoded initData string into dict."""
    return dict(urllib.parse.parse_qsl(raw, keep_blank_values=True))


def validate_init_data(raw_init_data: str, bot_token: str) -> dict[str, str]:
    """Validate Telegram WebApp initData via HMAC-SHA256.

    Spec: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
    Raises HTTPException 401 on failure.
    """
    parsed = _parse_init_data(raw_init_data)
    received_hash = parsed.pop("hash", None)
    if not received_hash:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing hash")

    data_check_string = "\n".join(
        f"{k}={v}" for k, v in sorted(parsed.items())
    )
    secret_key = hmac.new(
        b"WebAppData", bot_token.encode(), hashlib.sha256
    ).digest()
    expected = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(expected, received_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid initData")

    return parsed


def _synthetic_tg_from_user_uuid(user_id: uuid.UUID) -> int:
    """Map staff JWT user to a negative synthetic tg_user_id (real Telegram ids are positive)."""
    digest = hashlib.sha256(str(user_id).encode()).digest()
    val = int.from_bytes(digest[:8], "big") % (10**12)
    return -(val + 1)


def _allow_query_tg_fallback(cfg: Settings) -> bool:
    return cfg.mini_app_allow_query_tg_fallback or cfg.app_env in ("development", "test")


async def get_mini_app_user(
    request: Request,
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(security_bearer),
    ],
    db: AsyncSession = Depends(get_db),
) -> InitDataPayload:
    """Resolve Mini App user: Telegram initData (preferred), JWT Bearer, query tg_user_id, or anonymous guest."""
    import json

    cfg = get_settings()
    init_data_raw = (request.headers.get("X-Telegram-Init-Data") or "").strip()

    if init_data_raw:
        if not cfg.telegram_bot_token:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Bot not configured")
        try:
            parsed = validate_init_data(init_data_raw, cfg.telegram_bot_token)
        except HTTPException as exc:
            if exc.status_code != status.HTTP_401_UNAUTHORIZED:
                raise
            # Wrong/expired initData from Telegram WebApp — fall through to JWT / guest modes.
            parsed = None
        else:
            user_json = parsed.get("user", "{}")
            try:
                user_data: dict[str, Any] = json.loads(user_json)
            except Exception:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid user JSON")

            return InitDataPayload(
                tg_user_id=user_data.get("id", 0),
                first_name=user_data.get("first_name", ""),
                last_name=user_data.get("last_name"),
                username=user_data.get("username"),
                photo_url=user_data.get("photo_url"),
                language_code=user_data.get("language_code"),
            )

    if credentials is not None:
        try:
            token_payload = decode_access_token(credentials.credentials)
            user_uuid, _role = parse_access_payload(token_payload)
        except (JWTError, ValueError, KeyError):
            user_uuid = None

        if user_uuid is not None:
            result = await db.execute(select(User).where(User.id == user_uuid))
            user_row = result.scalar_one_or_none()
            if user_row is not None and user_row.is_active:
                return InitDataPayload(
                    tg_user_id=_synthetic_tg_from_user_uuid(user_row.id),
                    first_name=user_row.first_name or "",
                    last_name=user_row.last_name,
                    username=None,
                    photo_url=user_row.avatar_url,
                    language_code=user_row.lang,
                )

    if _allow_query_tg_fallback(cfg):
        qs = request.query_params.get("tg_user_id")
        if qs:
            try:
                tid = int(qs)
            except ValueError:
                tid = 0
            if tid != 0:
                return InitDataPayload(
                    tg_user_id=tid,
                    first_name="Test",
                    last_name=None,
                    username=None,
                    photo_url=None,
                    language_code=None,
                )

    anon_id = cfg.mini_app_browser_anonymous_tg_id
    guest_label = "Dev" if cfg.app_env == "development" else "Guest"
    return InitDataPayload(
        tg_user_id=anon_id,
        first_name=guest_label,
        last_name=None,
        username=None,
        photo_url=None,
        language_code=None,
    )


MiniAppUser = Annotated[InitDataPayload, Depends(get_mini_app_user)]

_SUPPORTED_LANGS = ("en", "ru", "uk", "bg")


def _resolved_salon_display_name(salon: Salon, lang: str) -> str:
    """Имя салона для языка: contacts.name_i18n[lang] → fallback по цепочке → salon.name."""
    contacts: dict[str, Any] = salon.contacts if isinstance(salon.contacts, dict) else {}
    ni = contacts.get("name_i18n")
    if isinstance(ni, dict):
        for key in (lang, "ru", "en", "uk", "bg"):
            val = ni.get(key)
            if isinstance(val, str) and val.strip():
                return val.strip()
    return (salon.name or "").strip()


def _resolve_lang(code: str | None) -> str:
    if not code:
        return "en"
    short = code[:2].lower()
    return short if short in _SUPPORTED_LANGS else "en"


_PLACEHOLDER_MINI_APP_FIRST_NAMES = frozenset({"Guest", "Dev", "Test"})


def _is_placeholder_mini_app_first_name(name: str | None) -> bool:
    """Synthetic Mini App users use these labels until the client saves a real name."""
    if not name:
        return False
    return name.strip() in _PLACEHOLDER_MINI_APP_FIRST_NAMES


async def _sync_client_lang(client: Client, payload: InitDataPayload, db: AsyncSession) -> None:
    """Update client.lang from Telegram initData if not yet set."""
    if not client.lang and payload.language_code:
        client.lang = _resolve_lang(payload.language_code)
        await db.flush()


async def _get_or_create_client(payload: InitDataPayload, db: AsyncSession) -> Client:
    client = (
        await db.execute(select(Client).where(Client.tg_user_id == payload.tg_user_id))
    ).scalar_one_or_none()
    if client is None:
        client = Client(
            tg_user_id=payload.tg_user_id,
            tg_username=payload.username,
            first_name=payload.first_name or None,
            last_name=payload.last_name,
            lang=_resolve_lang(payload.language_code),
            source=ClientSource.bot,
        )
        db.add(client)
        await db.flush()
        await db.refresh(client)
        return client

    changed = False
    if payload.username and client.tg_username != payload.username:
        client.tg_username = payload.username
        changed = True
    if payload.first_name:
        new_fn = payload.first_name.strip()
        cur = (client.first_name or "").strip()
        if new_fn and new_fn != cur:
            # Do not overwrite a saved real name with synthetic Guest/Dev from auth payload.
            if _is_placeholder_mini_app_first_name(new_fn) and cur and not _is_placeholder_mini_app_first_name(cur):
                pass
            else:
                client.first_name = new_fn
                changed = True
    if payload.last_name and client.last_name != payload.last_name:
        client.last_name = payload.last_name
        changed = True
    if not client.lang and payload.language_code:
        client.lang = _resolve_lang(payload.language_code)
        changed = True
    if changed:
        await db.flush()
    return client


# ─── Endpoints ────────────────────────────────────────────────────────────────


@router.get("/services", response_model=list[MiniAppServiceOut])
async def list_services(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> list[MiniAppServiceOut]:
    """Public: active services grouped by category."""
    rows = (
        await db.execute(
            select(Service)
            .where(Service.is_active.is_(True))
            .options(selectinload(Service.category))
            .order_by(Service.sort_order)
        )
    ).scalars().all()

    # Count masters per service via a separate query
    from sqlalchemy import func as sqlfunc
    master_counts = dict(
        (await db.execute(
            select(MasterService.service_id, sqlfunc.count(MasterService.master_id))
            .group_by(MasterService.service_id)
        )).all()
    )

    out: list[MiniAppServiceOut] = []
    for svc in rows:
        masters_count = master_counts.get(svc.id, 0)
        cat_name = svc.category.name_i18n if svc.category else {}
        out.append(
            MiniAppServiceOut(
                id=str(svc.id),
                name_i18n=svc.name_i18n,
                description_i18n=svc.description_i18n,
                price=float(svc.price),
                duration_minutes=svc.duration_minutes,
                duration_type=svc.duration_type,
                duration_max_minutes=svc.duration_max_minutes,
                photo_url=_resolve_mini_app_media_url(svc.photo_url, request),
                category_id=str(svc.category_id) if svc.category_id else None,
                category_name_i18n=cat_name,
                masters_count=masters_count,
            )
        )
    return out


@router.get("/services/{service_id}", response_model=MiniAppServiceOut)
async def get_service(
    request: Request,
    service_id: str,
    db: AsyncSession = Depends(get_db),
) -> MiniAppServiceOut:
    """Public: single service by id."""
    import uuid as _uuid

    try:
        sid = _uuid.UUID(service_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid service_id")

    svc = (
        await db.execute(
            select(Service)
            .where(Service.id == sid)
            .options(selectinload(Service.category))
        )
    ).scalar_one_or_none()

    if svc is None:
        raise HTTPException(status_code=404, detail="Service not found")

    from sqlalchemy import func as sqlfunc
    master_count_row = (
        await db.execute(
            select(sqlfunc.count(MasterService.master_id))
            .where(MasterService.service_id == svc.id)
        )
    ).scalar_one()

    cat_name = svc.category.name_i18n if svc.category else {}
    return MiniAppServiceOut(
        id=str(svc.id),
        name_i18n=svc.name_i18n,
        description_i18n=svc.description_i18n,
        price=float(svc.price),
        duration_minutes=svc.duration_minutes,
        duration_type=svc.duration_type,
        duration_max_minutes=svc.duration_max_minutes,
        photo_url=_resolve_mini_app_media_url(svc.photo_url, request),
        category_id=str(svc.category_id) if svc.category_id else None,
        category_name_i18n=cat_name,
        masters_count=master_count_row,
    )


@router.get("/masters", response_model=list[MiniAppMasterOut])
async def list_masters(
    request: Request,
    db: AsyncSession = Depends(get_db),
    service_id: str | None = None,
) -> list[MiniAppMasterOut]:
    """Public: active masters. When service_id is provided, returns only masters
    who have that service linked in master_service table."""
    import uuid as _uuid

    stmt = (
        select(Master)
        .where(Master.is_active.is_(True))
        .options(selectinload(Master.master_services).selectinload(MasterService.service))
        .order_by(Master.sort_order)
    )

    if service_id is not None:
        try:
            sid = _uuid.UUID(service_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid service_id")
        stmt = stmt.join(MasterService, MasterService.master_id == Master.id).where(
            MasterService.service_id == sid
        )

    rows = (await db.execute(stmt)).scalars().all()

    return [
        MiniAppMasterOut(
            id=str(m.id),
            display_name=m.display_name,
            bio=m.bio,
            photo_url=_resolve_mini_app_media_url(m.photo_url, request),
            specialization=m.specialization,
            rating_avg=float(m.rating_avg) if m.rating_avg is not None else None,
            rating_count=m.rating_count,
            services=[
                {
                    "id": str(ms.service.id),
                    "name_i18n": ms.service.name_i18n,
                }
                for ms in (m.master_services or [])
                if ms.service is not None
            ],
        )
        for m in rows
    ]


@router.get("/slots", response_model=MiniAppSlotsResponse)
async def get_slots(
    master_id: str,
    service_id: str,
    date: str,
    db: AsyncSession = Depends(get_db),
) -> MiniAppSlotsResponse:
    """Public: available time slots for a given master/service/date."""
    import uuid as _uuid
    from datetime import date as _date

    try:
        mid = _uuid.UUID(master_id)
        sid = _uuid.UUID(service_id)
        d = _date.fromisoformat(date)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=400, detail="Invalid params")

    service = await db.get(Service, sid)
    if service is None:
        raise HTTPException(status_code=404, detail="Service not found")

    ms = (
        await db.execute(
            select(MasterService).where(
                MasterService.master_id == mid,
                MasterService.service_id == sid,
            )
        )
    ).scalar_one_or_none()
    if ms is None:
        raise HTTPException(status_code=404, detail="Service not offered by this master")

    duration = int(ms.duration_override) if ms.duration_override is not None else int(service.duration_minutes)
    times = await schedule_service.get_available_slots(
        db,
        mid,
        d,
        duration,
        apply_lead_time=True,
    )
    return MiniAppSlotsResponse(date=date, slots=[t.strftime("%H:%M") for t in times])


def _default_working_hours() -> dict[str, Any]:
    return {
        "1": {"start": "09:00", "end": "18:00", "enabled": True},
        "2": {"start": "09:00", "end": "18:00", "enabled": True},
        "3": {"start": "09:00", "end": "18:00", "enabled": True},
        "4": {"start": "09:00", "end": "18:00", "enabled": True},
        "5": {"start": "09:00", "end": "18:00", "enabled": True},
        "6": {"start": "10:00", "end": "15:00", "enabled": True},
        "7": {"start": "00:00", "end": "00:00", "enabled": False},
    }


@router.get("/availability", response_model=MiniAppAvailabilityResponse)
async def get_availability(
    master_id: str,
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
) -> MiniAppAvailabilityResponse:
    from calendar import monthrange
    from datetime import date as _date
    import uuid as _uuid

    try:
        mid = _uuid.UUID(master_id)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=400, detail="Invalid master_id")
    master = await db.get(Master, mid)
    if master is None:
        raise HTTPException(status_code=404, detail="Master not found")

    real_month = month + 1 if 0 <= month <= 11 else month
    _, days_in_month = monthrange(year, real_month)
    ctx = await schedule_service.get_schedule_context(db)
    from zoneinfo import ZoneInfo
    import app.core.clock as clock
    today = clock.utc_now().astimezone(ZoneInfo(ctx.timezone)).date()
    working_hours = (
        master.working_hours
        if isinstance(master.working_hours, dict) and master.working_hours
        else _default_working_hours()
    )
    available_dates: list[str] = []
    for day in range(1, days_in_month + 1):
        d = _date(year, real_month, day)
        if d < today:
            continue
        dow = str(d.isoweekday())
        day_schedule = working_hours.get(dow, {})
        if isinstance(day_schedule, dict) and day_schedule.get("enabled", False):
            available_dates.append(d.isoformat())
    return MiniAppAvailabilityResponse(available_dates=available_dates)


def _apply_mini_booking_client_updates(client: Client, payload: MiniAppBookingCreate) -> None:
    if payload.client_name and payload.client_name.strip():
        client.first_name = payload.client_name.strip()
    if payload.client_phone is not None:
        stripped = payload.client_phone.strip()
        client.phone = stripped or None


async def _mini_resolve_price_duration(
    db: AsyncSession, master_id: uuid.UUID | None, service_id: uuid.UUID
) -> tuple[Decimal, int]:
    svc = await db.get(Service, service_id)
    if svc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")
    if master_id is None:
        return Decimal(svc.price), int(svc.duration_minutes)
    ms = (
        await db.execute(
            select(MasterService).where(
                MasterService.master_id == master_id,
                MasterService.service_id == service_id,
            )
        )
    ).scalar_one_or_none()
    if ms is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not offered by this master")
    price = ms.price_override if ms.price_override is not None else svc.price
    dur = ms.duration_override if ms.duration_override is not None else svc.duration_minutes
    return Decimal(price), int(dur)


@router.post("/bookings", response_model=MiniAppBookingOut)
async def create_booking(
    request: Request,
    payload: MiniAppBookingCreate,
    current_user: MiniAppUser,
    db: AsyncSession = Depends(get_db),
) -> MiniAppBookingOut:
    """Authenticated (initData): create booking from Mini App."""
    if not current_user.tg_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No Telegram user")

    client = await _get_or_create_client(current_user, db)
    _apply_mini_booking_client_updates(client, payload)
    await db.flush()

    import uuid as _uuid
    from datetime import UTC as _UTC
    from datetime import datetime as _dt
    from zoneinfo import ZoneInfo as _ZoneInfo

    from app.core.exceptions import ClientBlacklistedError, SlotTakenError
    from app.models.enums import BookingCreatedVia, BookingStatus

    if await is_blacklisted(db, client.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Client is blacklisted")

    comment_text = (payload.comment or payload.notes or "").strip() or None

    # ── Consultation booking (no master / time) ──────────────────────────
    if payload.needs_consultation:
        if not payload.service_id:
            raise HTTPException(status_code=400, detail="service_id required")

        try:
            sid = _uuid.UUID(payload.service_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid service_id")

        svc = await db.get(Service, sid)
        if not svc:
            raise HTTPException(status_code=404, detail="Service not found")

        booking = Booking(
            client_id=client.id,
            service_id=sid,
            master_id=None,
            starts_at=None,
            ends_at=None,
            price=svc.price,
            status=BookingStatus.pending,
            created_via=BookingCreatedVia.bot,
            needs_consultation=True,
            notes=payload.notes,
            client_comment=comment_text,
            any_master=False,
            call_for_time=False,
        )
        db.add(booking)
        await db.commit()
        await db.refresh(booking)

        bot = getattr(request.app.state, "bot", None)
        admin_chat_id = await get_admin_notify_chat_id(db)
        if admin_chat_id:
            from app.config import get_settings
            cfg = get_settings()
            svc_name = (svc.name_i18n or {}).get("ru") or (svc.name_i18n or {}).get("en") or svc.name
            await notify_admin(
                bot,
                admin_chat_id=admin_chat_id,
                event=AdminEvent.new_booking,
                app_domain=cfg.app_domain,
                client=client.first_name or str(client.tg_user_id or "—"),
                master="—",
                service=svc_name,
                date="уточняется",
            )

        return MiniAppBookingOut(
            id=str(booking.id),
            status=booking.status.value,
            starts_at=None,
            ends_at=None,
            price=float(booking.price),
            needs_consultation=True,
        )

    # ── Flexible: any master and/or time by phone ───────────────────────
    flexible = payload.any_master or payload.call_for_time
    if flexible:
        if not payload.service_id:
            raise HTTPException(status_code=400, detail="service_id required")
        try:
            sid = _uuid.UUID(payload.service_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid service_id")

        mid: uuid.UUID | None = None
        if payload.any_master:
            mid = None
        elif payload.master_id:
            try:
                mid = _uuid.UUID(payload.master_id)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid master_id")
        else:
            raise HTTPException(status_code=400, detail="master_id required unless any_master")

        if not payload.call_for_time and not payload.starts_at:
            raise HTTPException(status_code=400, detail="starts_at required unless call_for_time")

        price_dec, dur_min = await _mini_resolve_price_duration(db, mid, sid)

        starts_at_utc = None
        ends_at_utc = None
        if payload.starts_at and not payload.call_for_time:
            _dt_parsed = _dt.fromisoformat(payload.starts_at)
            if _dt_parsed.tzinfo is None:
                salon_row = (await db.execute(select(Salon).limit(1))).scalar_one_or_none()
                _tz_name = salon_row.timezone if salon_row else "Europe/Sofia"
                _dt_parsed = _dt_parsed.replace(tzinfo=_ZoneInfo(_tz_name))
            starts_at_utc = _dt_parsed.astimezone(_UTC)
            ends_at_utc = starts_at_utc + timedelta(minutes=dur_min)

        booking = Booking(
            client_id=client.id,
            service_id=sid,
            master_id=mid,
            starts_at=starts_at_utc,
            ends_at=ends_at_utc,
            price=price_dec,
            status=BookingStatus.pending,
            created_via=BookingCreatedVia.bot,
            needs_consultation=False,
            notes=None,
            client_comment=comment_text,
            any_master=payload.any_master,
            call_for_time=payload.call_for_time,
        )
        db.add(booking)
        await db.flush()
        await db.refresh(booking)

        bot = getattr(request.app.state, "bot", None)
        if mid is not None:
            await notify_master_new_booking(booking.id, bot, db)

        admin_chat_id = await get_admin_notify_chat_id(db)
        if admin_chat_id:
            from app.config import get_settings
            from app.models.master import Master
            cfg = get_settings()
            svc_obj = await db.get(Service, sid)
            svc_name = (svc_obj.name_i18n or {}).get("ru") or (svc_obj.name_i18n or {}).get("en") or svc_obj.name if svc_obj else "—"
            m_obj = await db.get(Master, mid) if mid else None
            date_str = booking.starts_at.strftime("%Y-%m-%d %H:%M") if booking.starts_at else "по звонку"
            await notify_admin(
                bot,
                admin_chat_id=admin_chat_id,
                event=AdminEvent.new_booking,
                app_domain=cfg.app_domain,
                client=client.first_name or str(client.tg_user_id or "—"),
                master=m_obj.display_name if m_obj else "любой",
                service=svc_name,
                date=date_str,
            )

        return MiniAppBookingOut(
            id=str(booking.id),
            status=booking.status.value,
            starts_at=booking.starts_at.isoformat() if booking.starts_at else None,
            ends_at=booking.ends_at.isoformat() if booking.ends_at else None,
            price=float(booking.price),
            needs_consultation=False,
        )

    # ── Regular booking (fixed master + slot) ─────────────────────────────
    if not payload.master_id or not payload.starts_at:
        raise HTTPException(status_code=400, detail="master_id and starts_at required for regular booking")

    _dt_parsed = _dt.fromisoformat(payload.starts_at)
    if _dt_parsed.tzinfo is None:
        salon_row = (await db.execute(select(Salon).limit(1))).scalar_one_or_none()
        _tz_name = salon_row.timezone if salon_row else "Europe/Sofia"
        _dt_parsed = _dt_parsed.replace(tzinfo=_ZoneInfo(_tz_name))
    starts_at_utc = _dt_parsed.astimezone(_UTC)

    try:
        booking = await create_tg_booking(
            db=db,
            client_id=client.id,
            master_id=_uuid.UUID(payload.master_id),
            service_id=_uuid.UUID(payload.service_id),
            starts_at=starts_at_utc,
            telegram_bot=getattr(request.app.state, "bot", None),
        )
    except ClientBlacklistedError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Client is blacklisted")
    except SlotTakenError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Slot is taken")

    booking.client_comment = comment_text
    booking.any_master = False
    booking.call_for_time = False
    await db.flush()

    bot = getattr(request.app.state, "bot", None)
    admin_chat_id = await get_admin_notify_chat_id(db)
    if admin_chat_id:
        from app.config import get_settings
        from app.models.master import Master
        cfg = get_settings()
        m_obj = await db.get(Master, _uuid.UUID(payload.master_id))
        svc_obj = await db.get(Service, _uuid.UUID(payload.service_id))
        svc_name = (svc_obj.name_i18n or {}).get("ru") or (svc_obj.name_i18n or {}).get("en") or svc_obj.name if svc_obj else "—"
        await notify_admin(
            bot,
            admin_chat_id=admin_chat_id,
            event=AdminEvent.new_booking,
            app_domain=cfg.app_domain,
            client=client.first_name or str(client.tg_user_id or "—"),
            master=m_obj.display_name if m_obj else "—",
            service=svc_name,
            date=booking.starts_at.strftime("%Y-%m-%d %H:%M") if booking.starts_at else "—",
        )

    return MiniAppBookingOut(
        id=str(booking.id),
        status=booking.status.value,
        starts_at=booking.starts_at.isoformat() if booking.starts_at else None,
        ends_at=booking.ends_at.isoformat() if booking.ends_at else None,
        price=float(booking.price),
        needs_consultation=False,
    )


# ─── My bookings ─────────────────────────────────────────────────────────────


class MiniAppMyBookingOut(MiniAppBookingOut):
    service_name: str = ""
    master_name: str = ""


@router.get("/my-bookings", response_model=list[MiniAppMyBookingOut])
async def list_my_bookings(
    current_user: MiniAppUser,
    db: AsyncSession = Depends(get_db),
) -> list[MiniAppMyBookingOut]:
    """Authenticated: return client's bookings (last 50)."""
    from app.models.booking import BookingStatus

    if not current_user.tg_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No Telegram user")

    client = (
        await db.execute(select(Client).where(Client.tg_user_id == current_user.tg_user_id))
    ).scalar_one_or_none()
    if client is None:
        return []

    stmt = (
        select(Booking)
        .where(Booking.client_id == client.id)
        .order_by(Booking.starts_at.desc().nulls_last())
        .limit(50)
        .options(
            selectinload(Booking.service),
            selectinload(Booking.master),
        )
    )
    rows = (await db.execute(stmt)).scalars().all()

    result = []
    for b in rows:
        svc_name = ""
        if b.service:
            n = b.service.name_i18n
            svc_name = n.get("ru") or n.get("en") or next(iter(n.values()), "") if n else ""
        master_name = b.master.display_name if b.master else ""
        result.append(
            MiniAppMyBookingOut(
                id=str(b.id),
                status=b.status.value,
                starts_at=b.starts_at.isoformat() if b.starts_at else None,
                ends_at=b.ends_at.isoformat() if b.ends_at else None,
                price=float(b.price),
                needs_consultation=b.needs_consultation,
                service_name=svc_name,
                master_name=master_name,
            )
        )
    return result


# ─── Me / Register ────────────────────────────────────────────────────────────


class MiniAppMeOut(_BM):
    first_name: str
    phone: str
    lang: str
    onboarded: bool


class MiniAppRegisterIn(_BM):
    first_name: str
    phone: str = ""
    lang: str = "ru"
    theme: str = "light"


@router.get("/me", response_model=MiniAppMeOut)
async def get_me(
    current_user: MiniAppUser,
    db: AsyncSession = Depends(get_db),
) -> MiniAppMeOut:
    """Authenticated: return client profile (creates browser guest row if needed)."""
    if not current_user.tg_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No Telegram user")
    client = await _get_or_create_client(current_user, db)
    return MiniAppMeOut(
        first_name=client.first_name or "",
        phone=client.phone or "",
        lang=client.lang or "ru",
        onboarded=bool(client.phone),
    )


class MiniAppGuestRegisterIn(_BM):
    first_name: str
    phone: str = ""
    lang: str = "ru"


@router.post("/register-guest", response_model=MiniAppMeOut)
async def register_guest(
    payload: MiniAppGuestRegisterIn,
    db: AsyncSession = Depends(get_db),
) -> MiniAppMeOut:
    """Public: register a browser user without Telegram initData.

    Creates (or updates by phone) a Client with source=manual so the admin
    panel can see them. If the user later opens the mini-app via Telegram the
    accounts will be separate unless they share the same phone number, in which
    case the bot will update the existing record.
    """
    from app.models.enums import ClientSource

    phone = payload.phone.strip()
    name = payload.first_name.strip()
    resolved_lang = _resolve_lang(payload.lang)

    # Try to find an existing (browser) client by phone to avoid duplicates
    client = None
    if phone:
        client = (
            await db.execute(
                select(Client).where(Client.phone == phone, Client.tg_user_id.is_(None))
            )
        ).scalar_one_or_none()

    if client is None:
        client = Client(
            tg_user_id=None,
            first_name=name or None,
            phone=phone or None,
            lang=resolved_lang,
            source=ClientSource.manual,
        )
        db.add(client)
    else:
        if name:
            client.first_name = name
        if phone:
            client.phone = phone
        client.lang = resolved_lang

    await db.commit()
    await db.refresh(client)
    return MiniAppMeOut(
        first_name=client.first_name or "",
        phone=client.phone or "",
        lang=client.lang or "ru",
        onboarded=True,
    )


@router.post("/register", response_model=MiniAppMeOut)
async def register_client(
    payload: MiniAppRegisterIn,
    current_user: MiniAppUser,
    db: AsyncSession = Depends(get_db),
) -> MiniAppMeOut:
    """Authenticated: save name, phone, lang from onboarding."""
    if not current_user.tg_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No Telegram user")
    client = await _get_or_create_client(current_user, db)
    if payload.first_name.strip():
        client.first_name = payload.first_name.strip()
    if payload.phone.strip():
        client.phone = payload.phone.strip()
    resolved = _resolve_lang(payload.lang)
    client.lang = resolved
    if payload.theme in ("light", "dark"):
        client.theme = payload.theme
    await db.commit()
    await db.refresh(client)
    return MiniAppMeOut(
        first_name=client.first_name or "",
        phone=client.phone or "",
        lang=client.lang or "ru",
        onboarded=bool(client.phone),
    )


# ─── Salon info ───────────────────────────────────────────────────────────────


class MiniAppSalonInfo(_BM):
    name: str = ""
    description: str = ""
    address: str = ""
    city: str = ""
    phone: str = ""
    working_hours: dict[str, Any] = Field(default_factory=dict)
    logo_url: str = ""
    favicon_url: str = ""


@router.get("/salon", response_model=MiniAppSalonInfo)
async def get_salon_info(
    lang: str = "ru",
    db: AsyncSession = Depends(get_db),
) -> MiniAppSalonInfo:
    """Public: return basic salon info. lang param selects description language."""
    from app.models.salon import Settings as SettingsModel

    salon = (await db.execute(select(Salon).limit(1))).scalar_one_or_none()
    if salon is None:
        return MiniAppSalonInfo()
    settings_row = (
        await db.execute(select(SettingsModel).where(SettingsModel.salon_id == salon.id).limit(1))
    ).scalar_one_or_none()
    contacts: dict[str, Any] = salon.contacts or {}
    desc_dict: dict[str, Any] = salon.description if isinstance(salon.description, dict) else {}
    resolved_lang = lang if lang in _SUPPORTED_LANGS else "en"
    desc = (
        desc_dict.get(resolved_lang)
        or desc_dict.get("ru")
        or desc_dict.get("en")
        or next(iter(desc_dict.values()), "")
        or ""
    )
    wh: dict[str, Any] = {}
    if settings_row and isinstance(settings_row.working_hours_default, dict):
        wh = dict(settings_row.working_hours_default)
    display_name = _resolved_salon_display_name(salon, resolved_lang)
    return MiniAppSalonInfo(
        name=display_name or (salon.name or ""),
        description=desc,
        address=str(contacts.get("address", "") or ""),
        city=str(contacts.get("city", "") or ""),
        phone=str(contacts.get("phone", "") or ""),
        working_hours=wh,
        logo_url=(salon.logo_url or "").strip(),
        favicon_url=(salon.favicon_url or "").strip(),
    )


# ─── Daily Pick ──────────────────────────────────────────────────────────────


class MiniAppDailyPickOut(_BM):
    id: str
    title: str
    tags: list[str]
    price: float | None = None
    service_id: str | None = None


class DailyPickUpsert(_BM):
    title_ru: str = ""
    title_en: str = ""
    title_uk: str = ""
    title_bg: str = ""
    tags_ru: str = ""
    tags_en: str = ""
    tags_uk: str = ""
    tags_bg: str = ""
    price: float | None = None
    service_id: str | None = None
    active: bool = True
    valid_from: str | None = None
    valid_to: str | None = None


@router.get("/daily-pick", response_model=MiniAppDailyPickOut | None)
async def get_daily_pick(
    lang: str = "ru",
    db: AsyncSession = Depends(get_db),
) -> MiniAppDailyPickOut | None:
    """Public: return today's active daily pick for Mini App."""
    from datetime import date as _date

    from sqlalchemy import or_

    from app.models.daily_pick import DailyPick

    today = _date.today()
    q = (
        select(DailyPick)
        .where(
            DailyPick.active.is_(True),
            or_(DailyPick.valid_from.is_(None), DailyPick.valid_from <= today),
            or_(DailyPick.valid_to.is_(None), DailyPick.valid_to >= today),
        )
        .order_by(DailyPick.updated_at.desc())
        .limit(1)
    )
    result = await db.execute(q)
    pick = result.scalar_one_or_none()
    if not pick:
        return None

    resolved = lang if lang in _SUPPORTED_LANGS else "ru"
    title = (
        getattr(pick, f"title_{resolved}", None)
        or pick.title_ru
        or pick.title_en
        or ""
    )
    raw_tags = getattr(pick, f"tags_{resolved}", None) or pick.tags_ru or ""
    tags = [t.strip() for t in raw_tags.split(",") if t.strip()] if raw_tags else []

    return MiniAppDailyPickOut(
        id=str(pick.id),
        title=title,
        tags=tags,
        price=float(pick.price) if pick.price is not None else None,
        service_id=str(pick.service_id) if pick.service_id else None,
    )


@router.get("/daily-pick/admin", response_model=list[MiniAppDailyPickOut])
async def list_daily_picks_admin(
    db: AsyncSession = Depends(get_db),
) -> list[MiniAppDailyPickOut]:
    """Admin: list all daily picks."""
    from app.models.daily_pick import DailyPick

    rows = (
        await db.execute(select(DailyPick).order_by(DailyPick.updated_at.desc()))
    ).scalars().all()

    out = []
    for p in rows:
        raw = p.tags_ru or ""
        tags = [t.strip() for t in raw.split(",") if t.strip()]
        out.append(MiniAppDailyPickOut(
            id=str(p.id),
            title=p.title_ru or p.title_en or "",
            tags=tags,
            price=float(p.price) if p.price is not None else None,
            service_id=str(p.service_id) if p.service_id else None,
        ))
    return out


class DailyPickFull(_BM):
    id: str
    title_ru: str
    title_en: str
    title_uk: str
    title_bg: str
    tags_ru: str
    tags_en: str
    tags_uk: str
    tags_bg: str
    price: float | None = None
    service_id: str | None = None
    active: bool
    valid_from: str | None = None
    valid_to: str | None = None


@router.get("/daily-pick/admin/{pick_id}", response_model=DailyPickFull)
async def get_daily_pick_admin(
    pick_id: str,
    db: AsyncSession = Depends(get_db),
) -> DailyPickFull:
    """Admin: get full daily pick by id."""
    import uuid as _uuid

    from app.models.daily_pick import DailyPick

    p = await db.get(DailyPick, _uuid.UUID(pick_id))
    if not p:
        raise HTTPException(404, "Not found")
    return DailyPickFull(
        id=str(p.id),
        title_ru=p.title_ru or "",
        title_en=p.title_en or "",
        title_uk=p.title_uk or "",
        title_bg=p.title_bg or "",
        tags_ru=p.tags_ru or "",
        tags_en=p.tags_en or "",
        tags_uk=p.tags_uk or "",
        tags_bg=p.tags_bg or "",
        price=float(p.price) if p.price is not None else None,
        service_id=str(p.service_id) if p.service_id else None,
        active=p.active,
        valid_from=p.valid_from.isoformat() if p.valid_from else None,
        valid_to=p.valid_to.isoformat() if p.valid_to else None,
    )


@router.post("/daily-pick/admin", response_model=DailyPickFull, status_code=201)
async def create_daily_pick(
    payload: DailyPickUpsert,
    db: AsyncSession = Depends(get_db),
) -> DailyPickFull:
    """Admin: create a daily pick."""
    import uuid as _uuid
    from datetime import date as _date

    from app.models.daily_pick import DailyPick

    p = DailyPick(
        title_ru=payload.title_ru or None,
        title_en=payload.title_en or None,
        title_uk=payload.title_uk or None,
        title_bg=payload.title_bg or None,
        tags_ru=payload.tags_ru or None,
        tags_en=payload.tags_en or None,
        tags_uk=payload.tags_uk or None,
        tags_bg=payload.tags_bg or None,
        price=payload.price,
        service_id=_uuid.UUID(payload.service_id) if payload.service_id else None,
        active=payload.active,
        valid_from=_date.fromisoformat(payload.valid_from) if payload.valid_from else None,
        valid_to=_date.fromisoformat(payload.valid_to) if payload.valid_to else None,
    )
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return await get_daily_pick_admin(str(p.id), db)


@router.patch("/daily-pick/admin/{pick_id}", response_model=DailyPickFull)
async def update_daily_pick(
    pick_id: str,
    payload: DailyPickUpsert,
    db: AsyncSession = Depends(get_db),
) -> DailyPickFull:
    """Admin: update a daily pick."""
    import uuid as _uuid
    from datetime import date as _date

    from app.models.daily_pick import DailyPick

    p = await db.get(DailyPick, _uuid.UUID(pick_id))
    if not p:
        raise HTTPException(404, "Not found")

    p.title_ru = payload.title_ru or None
    p.title_en = payload.title_en or None
    p.title_uk = payload.title_uk or None
    p.title_bg = payload.title_bg or None
    p.tags_ru = payload.tags_ru or None
    p.tags_en = payload.tags_en or None
    p.tags_uk = payload.tags_uk or None
    p.tags_bg = payload.tags_bg or None
    p.price = payload.price
    p.service_id = _uuid.UUID(payload.service_id) if payload.service_id else None
    p.active = payload.active
    p.valid_from = _date.fromisoformat(payload.valid_from) if payload.valid_from else None
    p.valid_to = _date.fromisoformat(payload.valid_to) if payload.valid_to else None

    await db.commit()
    await db.refresh(p)
    return await get_daily_pick_admin(str(p.id), db)


@router.delete("/daily-pick/admin/{pick_id}", status_code=204)
async def delete_daily_pick(
    pick_id: str,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Admin: delete a daily pick."""
    import uuid as _uuid

    from app.models.daily_pick import DailyPick

    p = await db.get(DailyPick, _uuid.UUID(pick_id))
    if not p:
        raise HTTPException(404, "Not found")
    await db.delete(p)
    await db.commit()


# ─── AI chat ─────────────────────────────────────────────────────────────────


class MiniAppAiRequest(_BM):
    message: str
    conversation_id: str | None = None
    image_base64: str | None = None
    image_mime_type: str | None = "image/jpeg"


class MiniAppAiResponse(_BM):
    reply: str
    conversation_id: str | None = None


@router.post("/ai", response_model=MiniAppAiResponse)
async def ai_chat(
    payload: MiniAppAiRequest,
    current_user: MiniAppUser,
    db: AsyncSession = Depends(get_db),
) -> MiniAppAiResponse:
    """Authenticated: chat with AI assistant."""
    import uuid

    if not current_user.tg_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No Telegram user")

    client = (
        await db.execute(select(Client).where(Client.tg_user_id == current_user.tg_user_id))
    ).scalar_one_or_none()
    if client is None:
        return MiniAppAiResponse(
            reply="Сначала напишите /start боту в Telegram.",
            conversation_id=None,
        )

    try:
        from app.services.ai_service import AIService
        from google.genai.errors import ClientError as _GenAIClientError

        svc = AIService(db=db, redis=None)
        reply_text, _chunks, _msg_id = await svc.ask(
            client_id=client.id,
            question=payload.message,
            image_base64=payload.image_base64,
            image_mime_type=payload.image_mime_type or "image/jpeg",
        )
        return MiniAppAiResponse(reply=reply_text, conversation_id=None)
    except Exception as _exc:  # noqa: BLE001
        _msg = str(_exc)
        if "RESOURCE_EXHAUSTED" in _msg or "429" in _msg:
            return MiniAppAiResponse(
                reply="AI-консультант временно перегружен. Попробуйте через несколько минут.",
                conversation_id=None,
            )
        return MiniAppAiResponse(
            reply="Извините, AI-консультант временно недоступен. Попробуйте позже.",
            conversation_id=None,
        )


# ─── Client profile ──────────────────────────────────────────────────────────


class MiniAppClientProfileOut(_BM):
    id: str
    first_name: str
    last_name: str | None = None
    phone: str | None = None
    lang: str
    theme: str = "light"
    tg_username: str | None = None
    total_bookings: int


class ClientProfileUpdate(_BM):
    first_name: str | None = None
    phone: str | None = None
    lang: str | None = None  # ru | en | uk | bg
    theme: str | None = None  # light | dark


@router.get("/client/profile", response_model=MiniAppClientProfileOut)
async def get_client_profile(
    current_user: MiniAppUser,
    db: AsyncSession = Depends(get_db),
) -> MiniAppClientProfileOut:
    """Authenticated: return enriched client profile."""
    if not current_user.tg_user_id:
        from fastapi import HTTPException as _HE
        raise _HE(status_code=status.HTTP_401_UNAUTHORIZED, detail="No Telegram user")
    client = await _get_or_create_client(current_user, db)
    return MiniAppClientProfileOut(
        id=str(client.id),
        first_name=client.first_name or "",
        last_name=client.last_name,
        phone=client.phone,
        lang=client.lang or "ru",
        theme=(client.theme or "light"),
        tg_username=client.tg_username,
        total_bookings=client.total_bookings,
    )


@router.patch("/client/profile", response_model=MiniAppClientProfileOut)
async def update_client_profile(
    payload: ClientProfileUpdate,
    current_user: MiniAppUser,
    db: AsyncSession = Depends(get_db),
) -> MiniAppClientProfileOut:
    """Authenticated: update client's own profile fields."""
    if not current_user.tg_user_id:
        from fastapi import HTTPException as _HE
        raise _HE(status_code=status.HTTP_401_UNAUTHORIZED, detail="No Telegram user")
    client = await _get_or_create_client(current_user, db)

    if payload.first_name is not None:
        stripped = payload.first_name.strip()
        if stripped:
            client.first_name = stripped
    if payload.phone is not None:
        client.phone = payload.phone.strip() or None
    if payload.lang is not None and payload.lang in _SUPPORTED_LANGS:
        client.lang = payload.lang
    if payload.theme is not None and payload.theme in ("light", "dark"):
        client.theme = payload.theme

    await db.commit()
    await db.refresh(client)
    return MiniAppClientProfileOut(
        id=str(client.id),
        first_name=client.first_name or "",
        last_name=client.last_name,
        phone=client.phone,
        lang=client.lang or "ru",
        theme=(client.theme or "light"),
        tg_username=client.tg_username,
        total_bookings=client.total_bookings,
    )


# ─── Service categories (public) ─────────────────────────────────────────────


@router.get("/service-categories")
async def get_service_categories_public(
    lang: str = "ru",
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Public: list active service categories for Mini App."""
    from app.models.catalog import ServiceCategory

    resolved = lang if lang in _SUPPORTED_LANGS else "ru"
    rows = (
        await db.execute(
            select(ServiceCategory).order_by(ServiceCategory.sort_order)
        )
    ).scalars().all()
    return [
        {
            "id": str(c.id),
            "name": c.name_i18n.get(resolved) or c.name_i18n.get("ru") or "",
            "name_i18n": c.name_i18n,
            "icon": c.icon,
            "sort_order": c.sort_order,
        }
        for c in rows
    ]


# ─── Contact master ──────────────────────────────────────────────────────────


class MiniAppContactIn(_BM):
    text: str


@router.post("/contact")
async def contact_master(
    payload: MiniAppContactIn,
    current_user: MiniAppUser,
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
) -> dict:
    """Authenticated: client sends a free-text message that appears in Admin Panel chat."""
    if not current_user.tg_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No Telegram user")

    stripped = payload.text.strip()
    if not stripped:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty message")

    import json as _json
    from app.models.chat_message import ChatMessage, MessageDirection, MessageType

    client = await _get_or_create_client(current_user, db)
    msg = ChatMessage(
        client_id=client.id,
        direction=MessageDirection.inbound,
        message_type=MessageType.text,
        text=stripped,
        is_read=False,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)

    # Publish real-time event so admin WebSocket picks it up
    if redis is not None:
        payload_ws = {
            "_event": "new_message",
            "id": str(msg.id),
            "client_id": str(client.id),
            "direction": "inbound",
            "message_type": "text",
            "text": stripped,
            "media_path": None,
            "tg_message_id": None,
            "is_read": False,
            "created_at": msg.created_at.isoformat(),
        }
        await redis.publish("chat:new_message", _json.dumps(payload_ws))

    return {"ok": True}


# ─── Cancel booking ────────────────────────────────────────────────────────────


@router.post("/bookings/{booking_id}/cancel", response_model=MiniAppMyBookingOut)
async def cancel_booking(
    booking_id: str,
    current_user: MiniAppUser,
    db: AsyncSession = Depends(get_db),
) -> MiniAppMyBookingOut:
    """Authenticated: cancel a client's own booking."""
    from app.models.booking import BookingStatus

    if not current_user.tg_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No Telegram user")

    client = (
        await db.execute(select(Client).where(Client.tg_user_id == current_user.tg_user_id))
    ).scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")

    import uuid as _uuid

    try:
        bk_uuid = _uuid.UUID(booking_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid booking id")

    booking = (
        await db.execute(
            select(Booking)
            .where(Booking.id == bk_uuid, Booking.client_id == client.id)
            .options(selectinload(Booking.service), selectinload(Booking.master))
        )
    ).scalar_one_or_none()
    if booking is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")

    if booking.status not in (BookingStatus.pending, BookingStatus.confirmed):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot cancel booking with status '{booking.status.value}'",
        )

    booking.status = BookingStatus.cancelled_by_client
    await db.commit()
    await db.refresh(booking)

    svc_name = ""
    if booking.service:
        n = booking.service.name_i18n
        svc_name = n.get("ru") or n.get("en") or next(iter(n.values()), "") if n else ""
    master_name = booking.master.display_name if booking.master else ""

    return MiniAppMyBookingOut(
        id=str(booking.id),
        status=booking.status.value,
        starts_at=booking.starts_at.isoformat(),
        ends_at=booking.ends_at.isoformat(),
        price=float(booking.price),
        service_name=svc_name,
        master_name=master_name,
    )
