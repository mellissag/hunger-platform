"""Актуальный каталог услуг и мастеров для system prompt AI-чата (Redis cache 5 min)."""

from __future__ import annotations

from typing import Any

from loguru import logger
from redis.asyncio import Redis
from sqlalchemy import exists, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.catalog import MasterService, Service, ServiceCategory, ServiceCategoryLink
from app.models.master import Master

_CACHE_PREFIX = "ai:catalog_context:"
_CACHE_TTL_SEC = 5 * 60
_LANGS = ("en", "ru", "uk", "bg")
_UNCATEGORIZED: dict[str, str] = {
    "ru": "Прочее",
    "en": "Other",
    "uk": "Інше",
    "bg": "Друго",
}


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


def _norm_lang(lang: str) -> str:
    l = (lang or "ru").split("-")[0].lower()
    return l if l in _LANGS else "ru"


def _duration_label(minutes: int, lang: str) -> str:
    unit = "min" if lang == "en" else "мин"
    return f"{minutes} {unit}"


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
        select(ServiceCategory).where(svc_active).order_by(ServiceCategory.sort_order)
    )
    return list(rows.scalars().all())


async def _services_for_category(db: AsyncSession, category_id: Any) -> list[Service]:
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


async def _uncategorized_services(db: AsyncSession) -> list[Service]:
    """Active services not linked to any category row."""
    in_any_category = exists(
        select(1)
        .select_from(ServiceCategoryLink)
        .where(ServiceCategoryLink.service_id == Service.id)
    )
    has_category_fk = Service.category_id.is_not(None)
    rows = await db.execute(
        select(Service)
        .where(
            Service.is_active.is_(True),
            ~in_any_category,
            ~has_category_fk,
        )
        .order_by(Service.sort_order)
    )
    return list(rows.scalars().all())


async def _load_active_masters(db: AsyncSession) -> list[Master]:
    stmt = (
        select(Master)
        .where(Master.is_active.is_(True))
        .options(selectinload(Master.master_services).selectinload(MasterService.service))
        .order_by(Master.sort_order, Master.display_name)
    )
    return list((await db.execute(stmt)).scalars().all())


async def build_catalog_context_text(db: AsyncSession, lang: str) -> str:
    """Format ## Current Services & Prices + ## Specialists for system prompt."""
    resolved = _norm_lang(lang)
    lines: list[str] = ["## Current Services & Prices"]

    categories = await _categories_with_active_services(db)
    listed_ids: set[Any] = set()

    for cat in categories:
        services = await _services_for_category(db, cat.id)
        if not services:
            continue
        cat_name = _pick_i18n(cat.name_i18n if isinstance(cat.name_i18n, dict) else {}, resolved)
        lines.append(f"{cat_name or '—'}:")
        for svc in services:
            listed_ids.add(svc.id)
            name = _pick_i18n(svc.name_i18n if isinstance(svc.name_i18n, dict) else {}, resolved)
            dur = _duration_label(int(svc.duration_minutes), resolved)
            lines.append(f"- {name} — {dur} — €{svc.price}")

    other = await _uncategorized_services(db)
    other = [s for s in other if s.id not in listed_ids]
    if other:
        lines.append(f"{_UNCATEGORIZED.get(resolved, _UNCATEGORIZED['ru'])}:")
        for svc in other:
            name = _pick_i18n(svc.name_i18n if isinstance(svc.name_i18n, dict) else {}, resolved)
            dur = _duration_label(int(svc.duration_minutes), resolved)
            lines.append(f"- {name} — {dur} — €{svc.price}")

    if len(lines) == 1:
        lines.append("(no active services)")

    lines.append("")
    lines.append("## Specialists")
    masters = await _load_active_masters(db)
    if not masters:
        lines.append("(no active specialists)")
    else:
        for m in masters:
            svc_names: list[str] = []
            for ms in m.master_services or []:
                svc = ms.service
                if svc is None or not svc.is_active:
                    continue
                svc_names.append(
                    _pick_i18n(svc.name_i18n if isinstance(svc.name_i18n, dict) else {}, resolved)
                )
            svc_list = ", ".join(svc_names) if svc_names else "—"
            lines.append(f"- {m.display_name}: {svc_list}")

    return "\n".join(lines) + "\n"


async def get_catalog_context_for_prompt(
    db: AsyncSession,
    redis: Redis | None,
    lang: str,
) -> str:
    """Cached catalog block (5 min) for AI system prompt."""
    resolved = _norm_lang(lang)
    cache_key = f"{_CACHE_PREFIX}{resolved}"

    if redis is not None:
        try:
            cached = await redis.get(cache_key)
            if cached:
                return cached if cached.endswith("\n") else cached + "\n"
        except Exception as e:  # noqa: BLE001
            logger.warning("ai_catalog_context cache read failed: {}", e)

    text = await build_catalog_context_text(db, resolved)

    if redis is not None:
        try:
            await redis.set(cache_key, text, ex=_CACHE_TTL_SEC)
        except Exception as e:  # noqa: BLE001
            logger.warning("ai_catalog_context cache write failed: {}", e)

    return text


async def invalidate_ai_catalog_context_cache(redis: Redis | None) -> None:
    """Call when catalog changes (same trigger as services:updates)."""
    if redis is None:
        return
    try:
        for lang in _LANGS:
            await redis.delete(f"{_CACHE_PREFIX}{lang}")
    except Exception as e:  # noqa: BLE001
        logger.warning("ai_catalog_context cache invalidate failed: {}", e)
