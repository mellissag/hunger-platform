"""Чтение и обновление салона + settings (owner)."""

from __future__ import annotations

import re
import uuid
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.salon import Salon, Settings
from app.schemas.salon_admin import SalonBundleOut, SalonOut, SettingsOut


def _mask_token(val: str | None) -> str | None:
    if not val or len(val) < 8:
        return None
    return "****" + val[-4:]


def mask_integrations(data: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for k, v in data.items():
        if not isinstance(v, dict):
            out[k] = v
            continue
        inner = dict(v)
        if "bot_token" in inner and isinstance(inner["bot_token"], str):
            inner["bot_token"] = _mask_token(inner["bot_token"]) or "****"
        if "password" in inner and isinstance(inner["password"], str):
            inner["password"] = "****" if inner["password"] else ""
        if "provider_token" in inner and isinstance(inner["provider_token"], str):
            inner["provider_token"] = _mask_token(inner["provider_token"]) or "****"
        out[k] = inner
    return out


async def get_salon_bundle(db: AsyncSession) -> SalonBundleOut | None:
    row = (await db.execute(select(Salon, Settings).join(Settings, Settings.salon_id == Salon.id))).first()
    if row is None:
        return None
    salon, settings = row
    sdict = SettingsOut.model_validate(settings).model_dump()
    sdict["integrations"] = mask_integrations(dict(settings.integrations or {}))
    return SalonBundleOut(
        salon=SalonOut.model_validate(salon),
        settings=SettingsOut.model_validate(sdict),
    )


def _deep_merge_dict(base: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    out = dict(base)
    for k, v in patch.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge_dict(out[k], v)  # type: ignore[arg-type]
        else:
            out[k] = v
    return out


def _strip_masked_secret_fields(d: dict[str, Any]) -> dict[str, Any]:
    """Не перезаписываем токены замаскированными значениями из UI."""
    out: dict[str, Any] = {}
    secret_keys = frozenset({"bot_token", "password", "provider_token", "api_key", "secret"})
    for k, v in d.items():
        if isinstance(v, dict):
            out[k] = _strip_masked_secret_fields(v)
            continue
        if k in secret_keys and isinstance(v, str) and (v.startswith("****") or v == "****"):
            continue
        out[k] = v
    return out


async def patch_salon_bundle(
    db: AsyncSession,
    *,
    salon: Salon,
    settings: Settings,
    salon_patch: dict[str, Any] | None,
    settings_patch: dict[str, Any] | None,
) -> SalonBundleOut:
    if salon_patch:
        raw_sp = dict(salon_patch)
        if "contacts" in raw_sp and isinstance(raw_sp["contacts"], dict):
            merged_c = _deep_merge_dict(dict(salon.contacts or {}), raw_sp["contacts"])
            salon.contacts = merged_c
            del raw_sp["contacts"]
        for k, v in raw_sp.items():
            setattr(salon, k, v)
    if settings_patch:
        raw = dict(settings_patch)
        if "integrations" in raw and isinstance(raw["integrations"], dict):
            cleaned = _strip_masked_secret_fields(raw["integrations"])
            merged = _deep_merge_dict(dict(settings.integrations or {}), cleaned)
            settings.integrations = merged
            del raw["integrations"]
        if "ai_system_prompt" in raw and isinstance(raw["ai_system_prompt"], dict):
            merged_p = _deep_merge_dict(dict(settings.ai_system_prompt or {}), raw["ai_system_prompt"])
            settings.ai_system_prompt = merged_p
            del raw["ai_system_prompt"]
        for k, v in raw.items():
            setattr(settings, k, v)
    await db.flush()
    row = await get_salon_bundle(db)
    assert row is not None
    return row


_SLUG = re.compile(r"[^a-zA-Z0-9._-]+")


async def save_brand_asset(
    *,
    salon_id: uuid.UUID,
    kind: str,
    filename: str,
    data: bytes,
) -> tuple[str, str]:
    """Сохраняет файл, возвращает (относительный path, public_url)."""
    cfg = get_settings()
    base = Path(cfg.upload_dir) / "salons" / str(salon_id)
    base.mkdir(parents=True, exist_ok=True)
    ext = Path(filename).suffix.lower()[:8] or ".bin"
    safe_kind = _SLUG.sub("-", kind)[:32] or "asset"
    name = f"{safe_kind}_{uuid.uuid4().hex[:10]}{ext}"
    path = base / name
    path.write_bytes(data)
    rel = f"media/salons/{salon_id}/{name}"
    public_url = f"/media/salons/{salon_id}/{name}"
    return rel, public_url
