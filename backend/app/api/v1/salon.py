"""Салон и настройки (owner)."""

from __future__ import annotations

from typing import Annotated, Any

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pathlib import Path

from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.exceptions import NotFoundError
from app.deps import get_db, require_roles
from app.models.enums import UserRole
from app.models.salon import Salon, Settings
from app.models.user import User
from app.schemas.salon_admin import (
    BrandUploadResponse,
    SalonBundleOut,
    SalonBundlePatch,
    TelegramVerifyRequest,
    TelegramVerifyResponse,
)
from app.services import salon_admin_service
from app.services.audit_log import record_event

router = APIRouter(prefix="/salon", tags=["salon"])

_OWNER = (UserRole.owner,)
_READ = (UserRole.owner, UserRole.admin)


@router.get("", response_model=SalonBundleOut)
async def get_salon(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*_READ))],
) -> SalonBundleOut:
    bundle = await salon_admin_service.get_salon_bundle(db)
    if bundle is None:
        raise NotFoundError("Salon not configured")
    return bundle


@router.patch("", response_model=SalonBundleOut)
async def patch_salon(
    body: SalonBundlePatch,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.owner, UserRole.admin))],
) -> SalonBundleOut:
    row = (await db.execute(select(Salon, Settings).join(Settings, Settings.salon_id == Salon.id))).first()
    if row is None:
        raise NotFoundError("Salon not configured")
    salon, settings = row
    sp = body.salon.model_dump(exclude_unset=True) if body.salon else None
    stp = body.settings.model_dump(exclude_unset=True) if body.settings else None
    if user.role == UserRole.admin:
        allowed = {
            "ai_enabled",
            "ai_system_prompt",
            "ai_model",
            "ai_temperature",
            "ai_few_shot_examples",
            "ai_allow_booking",
        }
        if sp:
            raise HTTPException(status_code=403, detail="Admins cannot change salon profile")
        if stp:
            stp = {k: v for k, v in stp.items() if k in allowed}
            if not stp:
                raise HTTPException(status_code=400, detail="No allowed fields to update")
    bundle = await salon_admin_service.patch_salon_bundle(
        db,
        salon=salon,
        settings=settings,
        salon_patch=sp,
        settings_patch=stp,
    )
    await record_event(
        db,
        user_id=user.id,
        action="settings.updated",
        entity_type="salon",
        entity_id=salon.id,
        payload={"keys": list((sp or {}).keys()) + list((stp or {}).keys())},
    )
    return bundle


@router.post("/telegram/verify", response_model=TelegramVerifyResponse)
async def verify_telegram(
    body: TelegramVerifyRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*_OWNER))],
) -> TelegramVerifyResponse:
    token = (body.token or "").strip()
    if not token:
        row = (await db.execute(select(Settings).limit(1))).scalar_one_or_none()
        if row and isinstance(row.integrations, dict):
            t = (row.integrations.get("telegram") or {}).get("bot_token")
            if isinstance(t, str):
                token = t
    if not token:
        token = (get_settings().telegram_bot_token or "").strip()
    if not token:
        return TelegramVerifyResponse(ok=False)
    url = f"https://api.telegram.org/bot{token}/getMe"
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(url)
        data = r.json()
        wh_url: str | None = None
        if data.get("ok"):
            wh = await client.get(f"https://api.telegram.org/bot{token}/getWebhookInfo")
            whj = wh.json()
            if whj.get("ok") and isinstance(whj.get("result"), dict):
                wh_url = whj["result"].get("url")
    if not data.get("ok"):
        return TelegramVerifyResponse(ok=False)
    res = data.get("result") or {}
    wid = res.get("id")
    un = res.get("username")
    return TelegramVerifyResponse(
        ok=True,
        bot_id=int(wid) if wid is not None else None,
        bot_username=f"@{un}" if isinstance(un, str) else None,
        webhook_url=wh_url,
    )


@router.post("/brand/upload", response_model=BrandUploadResponse)
async def upload_brand(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*_OWNER))],
    file: UploadFile = File(...),
    kind: str = Query("logo", pattern="^(logo|cover|favicon)$"),
) -> BrandUploadResponse:
    row = (await db.execute(select(Salon).limit(1))).scalar_one_or_none()
    if row is None:
        raise NotFoundError("Salon not configured")
    raw = await file.read()
    if len(raw) > 8 * 1024 * 1024:
        from fastapi import HTTPException

        raise HTTPException(status_code=413, detail="File too large (max 8MB)")
    rel, public_url = await salon_admin_service.save_brand_asset(
        salon_id=row.id,
        kind=kind,
        filename=file.filename or "image.png",
        data=raw,
    )
    if kind == "logo":
        row.logo_url = public_url
    elif kind == "cover":
        row.cover_url = public_url
    else:
        row.favicon_url = public_url
    await db.flush()
    return BrandUploadResponse(kind=kind, path=rel, public_url=public_url)


@router.get("/backups", response_model=dict)
async def list_backups(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*_OWNER))],
) -> dict[str, Any]:
    row = (await db.execute(select(Settings).limit(1))).scalar_one_or_none()
    if row is None:
        raise NotFoundError("Salon not configured")
    b = (row.integrations or {}).get("backup") or {}
    return {"cron": b.get("cron", "0 3 * * *"), "retention_days": b.get("retention_days", 7), "items": b.get("items", [])}


@router.post("/backups/run", response_model=dict)
async def run_backup_now(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*_OWNER))],
) -> dict[str, str]:
    from datetime import UTC, datetime

    row = (await db.execute(select(Settings).limit(1))).scalar_one_or_none()
    if row is None:
        raise NotFoundError("Salon not configured")
    integ = dict(row.integrations or {})
    b = dict(integ.get("backup") or {})
    items = list(b.get("items") or [])
    name = f"backup-{datetime.now(tz=UTC).strftime('%Y%m%d-%H%M%S')}.sql.gz"
    items.insert(0, {"name": name, "size_bytes": 0, "created_at": datetime.now(tz=UTC).isoformat()})
    b["items"] = items[:20]
    integ["backup"] = b
    row.integrations = integ
    await db.flush()
    await record_event(
        db,
        user_id=user.id,
        action="backup.requested",
        entity_type="salon",
        entity_id=row.salon_id,
        payload={"name": name},
    )
    return {"status": "scheduled", "name": name}


@router.get("/backups/last/download")
async def download_last_backup(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*_OWNER))],
):
    row = (await db.execute(select(Settings).limit(1))).scalar_one_or_none()
    if row is None:
        raise NotFoundError("Salon not configured")
    items = ((row.integrations or {}).get("backup") or {}).get("items") or []
    if not items:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="No backups yet")
    # Stub file: empty gzip placeholder
    from io import BytesIO

    from fastapi.responses import StreamingResponse

    buf = BytesIO(b"\n-- demo backup placeholder --\n")
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/gzip",
        headers={"Content-Disposition": f'attachment; filename="{items[0].get("name", "backup.sql.gz")}"'},
    )


@router.get("/files/{path:path}")
async def serve_media_file(
    path: str,
    _user: Annotated[User, Depends(require_roles(UserRole.owner, UserRole.admin))],
):
    """Отдача загруженных файлов (admin)."""
    cfg = get_settings()
    full = Path(cfg.upload_dir) / path
    try:
        full = full.resolve()
        base = Path(cfg.upload_dir).resolve()
        if not str(full).startswith(str(base)):
            from fastapi import HTTPException

            raise HTTPException(status_code=404)
    except OSError:
        from fastapi import HTTPException

        raise HTTPException(status_code=404) from None
    if not full.is_file():
        from fastapi import HTTPException

        raise HTTPException(status_code=404)
    return FileResponse(full)
