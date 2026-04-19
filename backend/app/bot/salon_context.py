"""Флаги салона из БД для меню."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.salon import Salon, Settings


async def get_ai_enabled(db: AsyncSession) -> bool:
    from app.config import get_settings

    row = (
        await db.execute(
            select(Settings.ai_enabled).join(Salon, Salon.id == Settings.salon_id).limit(1)
        )
    ).first()
    if not row or not row[0]:
        return False
    return bool(get_settings().gemini_api_key)


async def get_mini_app_enabled(db: AsyncSession) -> bool:
    row = (
        await db.execute(
            select(Settings.mini_app_enabled).join(Salon, Salon.id == Settings.salon_id).limit(1)
        )
    ).first()
    return bool(row and row[0])


async def get_mini_app_url(db: AsyncSession) -> str:
    from app.config import get_settings

    return f"https://{get_settings().app_domain}/mini-app"
