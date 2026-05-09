"""Telegram Mini App — HMAC initData validation + public endpoints."""

from __future__ import annotations

import hashlib
import hmac
import urllib.parse
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel as _BM
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.deps import get_db, get_redis
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
from app.services import schedule_service
from app.services.bot_booking import create_tg_booking
from app.utils.datetime_utils import ensure_aware

router = APIRouter(prefix="/mini-app", tags=["mini-app"])


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


async def get_mini_app_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> InitDataPayload:
    """FastAPI dependency: validate initData header, return parsed payload."""
    cfg = get_settings()
    if not cfg.telegram_bot_token:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Bot not configured")

    init_data_raw = request.headers.get("X-Telegram-Init-Data", "")
    if not init_data_raw:
        # Allow missing in dev/test
        if cfg.app_env == "development":
            return InitDataPayload(tg_user_id=0, first_name="Dev", last_name=None, username=None, photo_url=None)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing X-Telegram-Init-Data")

    parsed = validate_init_data(init_data_raw, cfg.telegram_bot_token)

    import json
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


MiniAppUser = Annotated[InitDataPayload, Depends(get_mini_app_user)]

_SUPPORTED_LANGS = ("en", "ru", "uk", "bg")


def _resolve_lang(code: str | None) -> str:
    if not code:
        return "en"
    short = code[:2].lower()
    return short if short in _SUPPORTED_LANGS else "en"


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
    if payload.first_name and client.first_name != payload.first_name:
        client.first_name = payload.first_name
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
                photo_url=svc.photo_url,
                category_id=str(svc.category_id) if svc.category_id else None,
                category_name_i18n=cat_name,
                masters_count=masters_count,
            )
        )
    return out


@router.get("/services/{service_id}", response_model=MiniAppServiceOut)
async def get_service(
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
        photo_url=svc.photo_url,
        category_id=str(svc.category_id) if svc.category_id else None,
        category_name_i18n=cat_name,
        masters_count=master_count_row,
    )


@router.get("/masters", response_model=list[MiniAppMasterOut])
async def list_masters(
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
            photo_url=m.photo_url,
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

    import uuid as _uuid
    from decimal import Decimal as _Decimal

    from app.models.enums import BookingCreatedVia, BookingStatus

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
        )
        db.add(booking)
        await db.commit()
        await db.refresh(booking)

        return MiniAppBookingOut(
            id=str(booking.id),
            status=booking.status.value,
            starts_at=None,
            ends_at=None,
            price=float(booking.price),
            needs_consultation=True,
        )

    # ── Regular booking ────────────────────────────────────────────────────
    from datetime import UTC as _UTC
    from datetime import datetime as _dt
    from zoneinfo import ZoneInfo as _ZoneInfo

    from app.core.exceptions import ClientBlacklistedError, SlotTakenError

    if not payload.master_id or not payload.starts_at:
        raise HTTPException(status_code=400, detail="master_id and starts_at required for regular booking")

    # Parse starts_at; the mini-app sends local salon-timezone times (from the slots endpoint)
    # so a naive datetime must be treated as salon local time, NOT UTC.
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
    """Authenticated: return client profile (or 404 if not yet registered)."""
    if not current_user.tg_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No Telegram user")
    client = (
        await db.execute(select(Client).where(Client.tg_user_id == current_user.tg_user_id))
    ).scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not registered")
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
    phone: str = ""


@router.get("/salon", response_model=MiniAppSalonInfo)
async def get_salon_info(
    lang: str = "ru",
    db: AsyncSession = Depends(get_db),
) -> MiniAppSalonInfo:
    """Public: return basic salon info. lang param selects description language."""
    salon = (await db.execute(select(Salon).limit(1))).scalar_one_or_none()
    if salon is None:
        return MiniAppSalonInfo()
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
    return MiniAppSalonInfo(
        name=salon.name or "",
        description=desc,
        address=contacts.get("address", ""),
        phone=contacts.get("phone", ""),
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
    tg_username: str | None = None
    total_bookings: int


class ClientProfileUpdate(_BM):
    first_name: str | None = None
    phone: str | None = None
    lang: str | None = None  # ru | en | uk | bg


@router.get("/client/profile", response_model=MiniAppClientProfileOut)
async def get_client_profile(
    current_user: MiniAppUser,
    db: AsyncSession = Depends(get_db),
) -> MiniAppClientProfileOut:
    """Authenticated: return enriched client profile."""
    if not current_user.tg_user_id:
        from fastapi import HTTPException as _HE
        raise _HE(status_code=status.HTTP_401_UNAUTHORIZED, detail="No Telegram user")
    client = (
        await db.execute(select(Client).where(Client.tg_user_id == current_user.tg_user_id))
    ).scalar_one_or_none()
    if client is None:
        from fastapi import HTTPException as _HE
        raise _HE(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
    return MiniAppClientProfileOut(
        id=str(client.id),
        first_name=client.first_name or "",
        last_name=client.last_name,
        phone=client.phone,
        lang=client.lang or "ru",
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
    client = (
        await db.execute(select(Client).where(Client.tg_user_id == current_user.tg_user_id))
    ).scalar_one_or_none()
    if client is None:
        from fastapi import HTTPException as _HE
        raise _HE(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")

    if payload.first_name is not None:
        stripped = payload.first_name.strip()
        if stripped:
            client.first_name = stripped
    if payload.phone is not None:
        client.phone = payload.phone.strip() or None
    if payload.lang is not None and payload.lang in _SUPPORTED_LANGS:
        client.lang = payload.lang

    await db.commit()
    await db.refresh(client)
    return MiniAppClientProfileOut(
        id=str(client.id),
        first_name=client.first_name or "",
        last_name=client.last_name,
        phone=client.phone,
        lang=client.lang or "ru",
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
