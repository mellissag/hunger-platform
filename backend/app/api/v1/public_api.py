"""Public unauthenticated endpoints (Mini App catalog, master profile)."""

from __future__ import annotations

import os
import urllib.parse
import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.deps import get_db
from app.models.catalog import MasterService, Service
from app.models.master import Master
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
