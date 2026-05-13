"""Salon-wide role_permissions JSON (admin + reception), Redis cache."""

from __future__ import annotations

import json
import logging
from typing import Any

from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.salon import Settings

logger = logging.getLogger(__name__)

REDIS_KEY_PREFIX = "v1:role_permissions:"
CACHE_TTL_SEC = 60

DEFAULT_ROLE_PERMISSIONS: dict[str, Any] = {
    "admin": {"clients_access": True},
    "reception": {
        "pages": {
            "bookings": True,
            "clients": True,
            "schedule": True,
            "analytics": True,
        }
    },
}


def _deep_merge_defaults(defaults: dict[str, Any], stored: dict[str, Any] | None) -> dict[str, Any]:
    if not stored:
        return json.loads(json.dumps(defaults))
    out = json.loads(json.dumps(defaults))
    admin_s = stored.get("admin") if isinstance(stored.get("admin"), dict) else {}
    if isinstance(admin_s, dict):
        out["admin"] = {**out["admin"], **{k: bool(v) for k, v in admin_s.items() if k == "clients_access"}}
    rec_s = stored.get("reception") if isinstance(stored.get("reception"), dict) else {}
    pages_s = rec_s.get("pages") if isinstance(rec_s.get("pages"), dict) else {}
    if pages_s:
        base_pages = dict(out["reception"]["pages"])
        for k in ("bookings", "clients", "schedule", "analytics"):
            if k in pages_s:
                base_pages[k] = bool(pages_s[k])
        out["reception"] = {"pages": base_pages}
    return out


async def _load_settings(db: AsyncSession) -> Settings | None:
    return (await db.execute(select(Settings).limit(1))).scalar_one_or_none()


async def get_merged_role_permissions(db: AsyncSession, redis: Redis | None) -> dict[str, Any]:
    settings = await _load_settings(db)
    if settings is None:
        return json.loads(json.dumps(DEFAULT_ROLE_PERMISSIONS))
    cache_key = f"{REDIS_KEY_PREFIX}{settings.id}"
    if redis is not None:
        try:
            cached = await redis.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception:  # noqa: BLE001
            logger.debug("role_permissions cache read failed", exc_info=True)

    raw = getattr(settings, "role_permissions", None) or {}
    if not isinstance(raw, dict):
        raw = {}
    merged = _deep_merge_defaults(DEFAULT_ROLE_PERMISSIONS, raw)

    if redis is not None:
        try:
            await redis.setex(cache_key, CACHE_TTL_SEC, json.dumps(merged))
        except Exception:  # noqa: BLE001
            logger.debug("role_permissions cache write failed", exc_info=True)
    return merged


async def invalidate_role_permissions_cache(redis: Redis | None, settings_id: Any) -> None:
    if redis is None:
        return
    try:
        await redis.delete(f"{REDIS_KEY_PREFIX}{settings_id}")
    except Exception:  # noqa: BLE001
        logger.debug("role_permissions cache invalidate failed", exc_info=True)


async def patch_stored_role_permissions(
    db: AsyncSession,
    redis: Redis | None,
    *,
    admin_patch: dict[str, Any] | None,
    reception_pages_patch: dict[str, bool] | None,
) -> dict[str, Any]:
    settings = await _load_settings(db)
    if settings is None:
        raise RuntimeError("Settings row missing")

    raw = getattr(settings, "role_permissions", None) or {}
    if not isinstance(raw, dict):
        raw = {}
    merged = _deep_merge_defaults(DEFAULT_ROLE_PERMISSIONS, raw)

    if admin_patch:
        for k, v in admin_patch.items():
            if k == "clients_access" and v is not None:
                merged["admin"]["clients_access"] = bool(v)

    if reception_pages_patch:
        for k, v in reception_pages_patch.items():
            if k in ("bookings", "clients", "schedule", "analytics"):
                merged["reception"]["pages"][k] = bool(v)

    # Persist only admin + reception (no master snapshot in DB)
    to_store = {
        "admin": dict(merged["admin"]),
        "reception": {"pages": dict(merged["reception"]["pages"])},
    }
    settings.role_permissions = to_store
    await db.flush()
    await invalidate_role_permissions_cache(redis, settings.id)
    return merged


async def admin_clients_access_allowed(db: AsyncSession, redis: Redis | None) -> bool:
    rp = await get_merged_role_permissions(db, redis)
    return bool(rp.get("admin", {}).get("clients_access", True))


async def reception_page_allowed(db: AsyncSession, redis: Redis | None, page: str) -> bool:
    rp = await get_merged_role_permissions(db, redis)
    pages = rp.get("reception", {}).get("pages", {})
    if not isinstance(pages, dict):
        return True
    return bool(pages.get(page, True))
