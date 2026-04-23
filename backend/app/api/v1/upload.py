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

ALLOWED_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}


class ImageUrlOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str


@router.post("/image", response_model=ImageUrlOut)
async def upload_image(
    file: UploadFile = File(...),
    folder: str = Query("misc", description="Подпапка внутри uploads"),
    _user: User = Depends(require_roles(UserRole.owner, UserRole.admin)),
) -> ImageUrlOut:
    if not SAFE_FOLDER.match(folder):
        raise HTTPException(status_code=400, detail="Invalid folder")
    content_type = file.content_type or ""
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Only JPG, PNG, WebP")
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 5 MB)")

    ext = ALLOWED_TYPES[content_type]
    filename = f"{uuid.uuid4().hex}.{ext}"
    rel = f"{folder}/{filename}"
    dest = UPLOAD_ROOT / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(content)
    return ImageUrlOut(url=f"/media/{rel}")
