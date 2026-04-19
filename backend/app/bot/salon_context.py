"""Флаги салона из БД для меню."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.salon import Salon, Settings


async def get_ai_enabled(db: AsyncSession) -> bool:
    row = (
        await db.execute(
            select(Settings.ai_enabled).join(Salon, Salon.id == Settings.salon_id).limit(1)
        )
    ).first()
    return bool(row and row[0])
