"""Telegram Mini App — HMAC initData validation + public endpoints."""

from __future__ import annotations

import hashlib
import hmac
import urllib.parse
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.deps import get_db
from app.models.catalog import MasterService, Service
from app.models.client import Client
from app.models.master import Master
from app.schemas.mini_app import (
    InitDataPayload,
    MiniAppBookingCreate,
    MiniAppBookingOut,
    MiniAppMasterOut,
    MiniAppServiceOut,
    MiniAppSlotsResponse,
)
from app.services import schedule_service
from app.services.bot_booking import create_tg_booking

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
    )


MiniAppUser = Annotated[InitDataPayload, Depends(get_mini_app_user)]


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
                photo_url=svc.photo_url,
                category_id=str(svc.category_id) if svc.category_id else None,
                category_name_i18n=cat_name,
                masters_count=masters_count,
            )
        )
    return out


@router.get("/masters", response_model=list[MiniAppMasterOut])
async def list_masters(
    db: AsyncSession = Depends(get_db),
) -> list[MiniAppMasterOut]:
    """Public: active masters."""
    rows = (
        await db.execute(
            select(Master)
            .where(Master.is_active.is_(True))
            .order_by(Master.sort_order)
        )
    ).scalars().all()

    return [
        MiniAppMasterOut(
            id=str(m.id),
            display_name=m.display_name,
            bio=m.bio,
            photo_url=m.photo_url,
            specialization=m.specialization,
            rating_avg=float(m.rating_avg) if m.rating_avg is not None else None,
            rating_count=m.rating_count,
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

    ctx = await schedule_service.get_schedule_context(db, mid, sid, d)
    return MiniAppSlotsResponse(date=date, slots=ctx.free_slots)


@router.post("/bookings", response_model=MiniAppBookingOut)
async def create_booking(
    payload: MiniAppBookingCreate,
    current_user: MiniAppUser,
    db: AsyncSession = Depends(get_db),
) -> MiniAppBookingOut:
    """Authenticated (initData): create booking from Mini App."""
    if not current_user.tg_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No Telegram user")

    client = (
        await db.execute(select(Client).where(Client.tg_user_id == current_user.tg_user_id))
    ).scalar_one_or_none()

    if client is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found. Start the bot first.",
        )

    import uuid as _uuid
    from datetime import datetime as _dt

    from app.core.exceptions import ClientBlacklistedError, SlotTakenError

    try:
        booking = await create_tg_booking(
            db=db,
            client_id=client.id,
            master_id=_uuid.UUID(payload.master_id),
            service_id=_uuid.UUID(payload.service_id),
            starts_at=_dt.fromisoformat(payload.starts_at),
        )
    except ClientBlacklistedError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Client is blacklisted")
    except SlotTakenError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Slot is taken")

    return MiniAppBookingOut(
        id=str(booking.id),
        status=booking.status.value,
        starts_at=booking.starts_at.isoformat(),
        ends_at=booking.ends_at.isoformat(),
        price=float(booking.price),
    )
