"""Public unauthenticated endpoints (Mini App catalog, master profile)."""

from __future__ import annotations

import os
import urllib.parse
import uuid
from decimal import Decimal
from typing import Annotated

import uuid as uuid_mod

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.deps import get_db, get_redis
from app.models.catalog import MasterService, Service
from app.models.client import Client
from app.models.enums import ClientSource
from app.models.master import Master
from app.models.salon import Settings as SalonSettings
from app.schemas.public_master import (
    PublicMasterCertificateItem,
    PublicMasterProfileOut,
    PublicMasterReviewItem,
    PublicMasterServiceItem,
)
from app.services import loyalty_service, master_phase20
from app.schemas.loyalty import PromoValidateIn, PromoValidateOut
from app.services.loyalty_service import PromoValidationError

router = APIRouter(prefix="/public", tags=["public"])

_SUPPORTED_LANGS = frozenset({"ru", "en", "uk", "bg"})
_SITE_CLIENT_PREFIX = "ai_site_client:"


def _public_origin_for_media(request: Request) -> str:
    explicit = (os.environ.get("BASE_URL") or "").strip().rstrip("/")
    if explicit:
        return explicit
    from app.config import get_settings

    settings = get_settings()
    if settings.app_env in ("development", "test"):
        return str(request.base_url).rstrip("/")
    return f"https://{settings.app_domain}".rstrip("/")


def _resolve_public_media_url(raw: str | None, request: Request) -> str | None:
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


def _pick_i18n_text(d: object, lang: str) -> str:
    if not isinstance(d, dict):
        return ""
    m: dict[str, str] = {str(k): str(v) for k, v in d.items() if v is not None}
    if not m:
        return ""
    if lang in m and m[lang].strip():
        return m[lang].strip()
    for k in ("ru", "en", "uk", "bg"):
        if k in m and m[k].strip():
            return m[k].strip()
    for v in m.values():
        if v.strip():
            return v.strip()
    return ""


def _normalize_cert_row(c: object) -> PublicMasterCertificateItem | None:
    if isinstance(c, str):
        t = c.strip()
        return PublicMasterCertificateItem(title=t, year=None, photo_url=None) if t else None
    if not isinstance(c, dict):
        return None
    title = str(c.get("title") or c.get("name") or c.get("t") or "").strip()
    if not title:
        return None
    y = c.get("year")
    year = int(y) if y is not None and str(y).isdigit() else None
    pu = c.get("photo_url")
    photo = str(pu).strip() if pu else None
    return PublicMasterCertificateItem(title=title, year=year, photo_url=photo or None)


@router.get("/masters/{master_id}", response_model=PublicMasterProfileOut)
async def public_master_profile(
    request: Request,
    master_id: str,
    db: AsyncSession = Depends(get_db),
    lang: str = Query("ru", min_length=2, max_length=5),
) -> PublicMasterProfileOut:
    """Full public profile for Telegram Mini App (no auth)."""
    try:
        mid = uuid.UUID(master_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid master_id") from e

    stmt = (
        select(Master)
        .where(Master.id == mid, Master.is_active.is_(True))
        .options(selectinload(Master.master_services).selectinload(MasterService.service))
    )
    m = (await db.execute(stmt)).scalar_one_or_none()
    if m is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Master not found")

    services_out: list[PublicMasterServiceItem] = []
    for ms in m.master_services or []:
        svc = ms.service
        if svc is None or not svc.is_active:
            continue
        dur = int(ms.duration_override) if ms.duration_override is not None else int(svc.duration_minutes)
        price_dec: Decimal = ms.price_override if ms.price_override is not None else svc.price
        services_out.append(
            PublicMasterServiceItem(
                service_id=str(svc.id),
                name_i18n=svc.name_i18n if isinstance(svc.name_i18n, dict) else {},
                price=float(price_dec),
                duration_minutes=dur,
                duration_type=str(svc.duration_type),
                duration_max_minutes=svc.duration_max_minutes,
            )
        )

    reviews_page = await master_phase20.list_reviews_page(db, mid, page=1, page_size=80)
    rev_out: list[PublicMasterReviewItem] = []
    for r in reviews_page.items:
        cname: str | None = None
        if r.client and r.client.name:
            cname = r.client.name.strip() or None
        rev_out.append(
            PublicMasterReviewItem(
                client_name=cname,
                text=r.text,
                rating=r.rating,
                created_at=r.created_at,
            )
        )

    certs_out: list[PublicMasterCertificateItem] = []
    for c in m.certificates or []:
        item = _normalize_cert_row(c)
        if item is None:
            continue
        certs_out.append(
            PublicMasterCertificateItem(
                title=item.title,
                year=item.year,
                photo_url=_resolve_public_media_url(item.photo_url, request),
            )
        )

    portfolio_urls: list[str] = []
    for p in m.portfolio or []:
        u: str | None = None
        if isinstance(p, dict):
            raw_u = p.get("url")
            u = str(raw_u).strip() if raw_u else None
        elif isinstance(p, str):
            u = p.strip() or None
        if u:
            resolved = _resolve_public_media_url(u, request)
            if resolved:
                portfolio_urls.append(resolved)

    bio_raw = m.bio if isinstance(m.bio, dict) else {}
    bio_map = {str(k): str(v) for k, v in bio_raw.items() if v is not None}

    spec_raw = m.specialization if isinstance(m.specialization, dict) else {}
    spec_map = {str(k): str(v) for k, v in spec_raw.items() if v is not None}

    return PublicMasterProfileOut(
        id=str(m.id),
        display_name=m.display_name,
        photo_url=_resolve_public_media_url(m.photo_url, request),
        description=_pick_i18n_text(bio_map, lang),
        description_i18n=bio_map,
        specialization=_pick_i18n_text(spec_map, lang),
        specialization_i18n=spec_map,
        rating_avg=float(m.rating_avg) if m.rating_avg is not None else None,
        rating_count=int(m.rating_count or 0),
        services=services_out,
        reviews=rev_out,
        reviews_total=reviews_page.total,
        certificates=certs_out,
        portfolio_urls=portfolio_urls,
    )


class PublicAiChatButton(BaseModel):
    label: str
    value: str


class PublicAiChatRequest(BaseModel):
    message: str = ""
    button_value: str | None = None
    button_label: str | None = None
    image_base64: str | None = None
    image_mime_type: str | None = "image/jpeg"


class PublicAiChatResponse(BaseModel):
    reply: str
    buttons: list[PublicAiChatButton] = Field(default_factory=list)
    booking_state: str | None = None
    session_id: str | None = None
    has_more_slots: bool = False
    all_slots: list[str] = Field(default_factory=list)
    slot_buttons: list[PublicAiChatButton] = Field(default_factory=list)


def _public_ai_response_from_dialog(result: dict, session_id: str) -> PublicAiChatResponse:
    return PublicAiChatResponse(
        reply=result.get("response") or "",
        buttons=[PublicAiChatButton(**b) for b in result.get("buttons") or []],
        booking_state=result.get("booking_state"),
        session_id=session_id,
        has_more_slots=bool(result.get("has_more_slots")),
        all_slots=list(result.get("all_slots") or []),
        slot_buttons=[PublicAiChatButton(**b) for b in result.get("slot_buttons") or []],
    )


class PublicSalonAiFlags(BaseModel):
    ai_enabled: bool = False
    ai_allow_booking: bool = False


@router.get("/ai/flags", response_model=PublicSalonAiFlags)
async def public_ai_flags(db: AsyncSession = Depends(get_db)) -> PublicSalonAiFlags:
    row = (await db.execute(select(SalonSettings).limit(1))).scalar_one_or_none()
    if row is None:
        return PublicSalonAiFlags()
    return PublicSalonAiFlags(
        ai_enabled=bool(row.ai_enabled),
        ai_allow_booking=bool(row.ai_allow_booking),
    )


def _resolve_lang(accept_language: str | None, client_lang: str | None) -> str:
    if client_lang and client_lang.split("-")[0].lower() in _SUPPORTED_LANGS:
        return client_lang.split("-")[0].lower()
    if accept_language:
        for part in accept_language.split(","):
            code = part.strip().split(";")[0].split("-")[0].lower()
            if code in _SUPPORTED_LANGS:
                return code
    return "ru"


async def _get_or_create_site_client(
    db: AsyncSession,
    redis,
    session_id: str,
    lang: str,
) -> Client:
    if redis is not None:
        raw = await redis.get(f"{_SITE_CLIENT_PREFIX}{session_id}")
        if raw:
            try:
                cid = uuid_mod.UUID(str(raw))
                c = await db.get(Client, cid)
                if c is not None:
                    return c
            except ValueError:
                pass
    c = Client(
        first_name="Guest",
        lang=lang,
        source=ClientSource.manual,
    )
    db.add(c)
    await db.flush()
    if redis is not None:
        await redis.set(f"{_SITE_CLIENT_PREFIX}{session_id}", str(c.id), ex=86400 * 30)
    return c


@router.post("/ai/chat", response_model=PublicAiChatResponse)
async def public_ai_chat(
    payload: PublicAiChatRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
    x_ai_session: Annotated[str | None, Header(alias="X-Ai-Session")] = None,
    accept_language: Annotated[str | None, Header(alias="Accept-Language")] = None,
) -> PublicAiChatResponse:
    """Site widget AI chat (session via X-Ai-Session header or cookie)."""
    session_id = (x_ai_session or "").strip() or request.cookies.get("ai_chat_session", "").strip()
    if not session_id:
        session_id = str(uuid_mod.uuid4())
        response.set_cookie(
            key="ai_chat_session",
            value=session_id,
            max_age=86400 * 30,
            httponly=True,
            samesite="lax",
        )

    user_text = (payload.button_value or payload.message or "").strip()
    if not user_text and not payload.image_base64:
        return PublicAiChatResponse(reply="", session_id=session_id)

    settings_row = (await db.execute(select(SalonSettings).limit(1))).scalar_one_or_none()
    if settings_row is None or not settings_row.ai_enabled:
        return PublicAiChatResponse(
            reply="AI assistant is not available.",
            session_id=session_id,
        )

    client = await _get_or_create_site_client(db, redis, session_id, "ru")

    from app.services.ai_booking_dialog import (
        detect_booking_intent,
        handle_booking_dialog,
        in_active_booking_dialog,
        load_booking_session,
        resolve_booking_language,
    )
    from app.services.ai_service import AIService

    booking_via_ai = bool(settings_row.ai_allow_booking)
    chat_session = f"site:{session_id}"
    session_data = await load_booking_session(redis, chat_session) if redis else None
    booking_lang = await resolve_booking_language(
        db,
        client_lang=client.lang,
        telegram_lang=None,
        accept_language=accept_language,
        user_message=user_text,
        existing_session=session_data,
    )
    client.lang = booking_lang

    if booking_via_ai and redis is not None:
        if in_active_booking_dialog(session_data):
            result = await handle_booking_dialog(
                chat_session,
                user_text,
                client.id,
                booking_lang,
                db,
                redis,
                telegram_bot=getattr(request.app.state, "bot", None),
            )
            return _public_ai_response_from_dialog(result, session_id)
        if user_text and not payload.image_base64:
            intent = await detect_booking_intent(db, user_text)
            if intent == "BOOK":
                result = await handle_booking_dialog(
                    chat_session,
                    user_text,
                    client.id,
                    booking_lang,
                    db,
                    redis,
                    telegram_bot=getattr(request.app.state, "bot", None),
                    force_start=True,
                )
                return _public_ai_response_from_dialog(result, session_id)

    try:
        svc = AIService(db=db, redis=redis)
        reply_text, _, _ = await svc.ask(
            client_id=client.id,
            question=user_text or "Photo",
            image_base64=payload.image_base64,
            image_mime_type=payload.image_mime_type or "image/jpeg",
        )
        return PublicAiChatResponse(reply=reply_text, session_id=session_id)
    except Exception:  # noqa: BLE001
        return PublicAiChatResponse(
            reply="Sorry, the AI assistant is temporarily unavailable.",
            session_id=session_id,
        )


@router.post("/promo-codes/validate", response_model=PromoValidateOut)
async def validate_promo_code(
    body: PromoValidateIn,
    db: AsyncSession = Depends(get_db),
) -> PromoValidateOut:
    try:
        promo, discount = await loyalty_service.validate_promo_code(
            db,
            code=body.code,
            booking_amount=body.booking_amount,
            client_id=body.client_id,
        )
    except PromoValidationError as e:
        return PromoValidateOut(valid=False, error=e.code)

    final = max(Decimal("0"), body.booking_amount - discount)
    out = PromoValidateOut(
        valid=True,
        code=promo.code,
        discount_type=promo.discount_type,
        discount_amount=discount,
        final_amount=final,
    )
    if promo.discount_type.value == "percent":
        out.discount_percent = promo.discount_value
    return out
