"""Загрузка изображений (общий endpoint)."""

from __future__ import annotations

import os
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, ConfigDict

from app.deps import require_roles
from app.models.enums import UserRole
from app.models.user import User

router = APIRouter(prefix="/upload", tags=["upload"])

UPLOAD_ROOT = Path(os.environ.get("UPLOAD_DIR", "./data/uploads"))
SAFE_FOLDER = re.compile(r"^[a-z0-9_]{1,32}$")
BASE_URL = os.environ.get("BASE_URL", "https://test-adm.tech").rstrip("/")

ALLOWED_IMAGES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}

# Backward-compat alias used by color_formulas.py
ALLOWED_TYPES = ALLOWED_IMAGES

ALLOWED_MEDIA: dict[str, tuple[str, str, int]] = {
    # content_type → (extension, media_type hint, max_bytes)
    "image/jpeg":       ("jpg",  "photo",      5 * 1024 * 1024),
    "image/png":        ("png",  "photo",      5 * 1024 * 1024),
    "image/webp":       ("webp", "photo",      5 * 1024 * 1024),
    "image/gif":        ("gif",  "animation",  10 * 1024 * 1024),
    "video/mp4":        ("mp4",  "video",      50 * 1024 * 1024),
    "video/quicktime":  ("mov",  "video",      50 * 1024 * 1024),
    "audio/ogg":        ("ogg",  "voice",      10 * 1024 * 1024),
    "audio/mpeg":       ("mp3",  "voice",      10 * 1024 * 1024),
    "audio/mp3":        ("mp3",  "voice",      10 * 1024 * 1024),
    "audio/webm":       ("webm", "voice",      10 * 1024 * 1024),
    "audio/mp4":        ("m4a",  "voice",      10 * 1024 * 1024),
    "audio/x-m4a":      ("m4a",  "voice",      10 * 1024 * 1024),
}


class ImageUrlOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str


class MediaUrlOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str
    media_type: str


@router.post("/image", response_model=ImageUrlOut)
async def upload_image(
    file: UploadFile = File(...),
    folder: str = Query("misc", description="Подпапка внутри uploads"),
    _user: User = Depends(require_roles(UserRole.owner, UserRole.admin)),
) -> ImageUrlOut:
    if not SAFE_FOLDER.match(folder):
        raise HTTPException(status_code=400, detail="Invalid folder")
    content_type = file.content_type or ""
    if content_type not in ALLOWED_IMAGES:
        raise HTTPException(status_code=400, detail="Only JPG, PNG, WebP")
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 5 MB)")

    ext = ALLOWED_IMAGES[content_type]
    filename = f"{uuid.uuid4().hex}.{ext}"
    rel = f"{folder}/{filename}"
    dest = UPLOAD_ROOT / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(content)
    return ImageUrlOut(url=f"{BASE_URL}/media/{rel}")


@router.post("/media", response_model=MediaUrlOut)
async def upload_media(
    file: UploadFile = File(...),
    folder: str = Query("broadcasts", description="Подпапка внутри uploads"),
    _user: User = Depends(require_roles(UserRole.owner, UserRole.admin)),
) -> MediaUrlOut:
    """Upload any broadcast media: photo, GIF, video, audio/voice."""
    if not SAFE_FOLDER.match(folder):
        raise HTTPException(status_code=400, detail="Invalid folder")
    content_type = (file.content_type or "").lower().split(";")[0].strip()
    if content_type not in ALLOWED_MEDIA:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported type {content_type}. Allowed: JPG/PNG/WebP/GIF, MP4/MOV, OGG/MP3/WebM/M4A",
        )
    ext, media_hint, max_bytes = ALLOWED_MEDIA[content_type]
    content = await file.read()
    if len(content) > max_bytes:
        raise HTTPException(status_code=400, detail=f"File too large (max {max_bytes // 1024 // 1024} MB)")

    filename = f"{uuid.uuid4().hex}.{ext}"
    rel = f"{folder}/{filename}"
    dest = UPLOAD_ROOT / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(content)
    return MediaUrlOut(url=f"{BASE_URL}/media/{rel}", media_type=media_hint)
