"""Настройки отображения (тема) — доступны любому аутентифицированному сотруднику."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.deps import get_current_user, get_db
from app.models.salon import Salon, Settings
from app.models.user import User
from app.schemas.salon_admin import SettingsOut
from app.schemas.settings import ThemeUpdate

router = APIRouter(prefix="/settings", tags=["settings"])


@router.put("/theme", response_model=SettingsOut)
async def update_theme(
    data: ThemeUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(get_current_user)],
) -> SettingsOut:
    row = (
        await db.execute(select(Salon, Settings).join(Settings, Settings.salon_id == Salon.id))
    ).first()
    if row is None:
        raise NotFoundError("Salon not configured")
    _salon, settings = row
    settings.theme = data.theme
    await db.flush()
    await db.refresh(settings)
    return SettingsOut.model_validate(settings)
