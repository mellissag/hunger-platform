"""Превью размера сегмента."""

from __future__ import annotations

import json
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, require_roles
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.segment import SegmentCriteria, SegmentPreviewOut
from app.services import segment_service

router = APIRouter(prefix="/segments", tags=["segments"])

STAFF = (UserRole.owner, UserRole.admin)


class SegmentPreviewBody(BaseModel):
    criteria: dict[str, Any]


@router.get("/preview", response_model=SegmentPreviewOut)
async def preview_segment_get(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*STAFF))],
    criteria: str = Query(..., description="JSON критерия сегмента"),
) -> SegmentPreviewOut:
    try:
        raw = json.loads(criteria)
        crit = SegmentCriteria.model_validate(raw)
    except (json.JSONDecodeError, ValidationError) as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    n = await segment_service.count_segment_clients(db, crit)
    return SegmentPreviewOut(count=n)


@router.post("/preview", response_model=SegmentPreviewOut)
async def preview_segment_post(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*STAFF))],
    body: SegmentPreviewBody,
) -> SegmentPreviewOut:
    try:
        crit = SegmentCriteria.model_validate(body.criteria)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    n = await segment_service.count_segment_clients(db, crit)
    return SegmentPreviewOut(count=n)
