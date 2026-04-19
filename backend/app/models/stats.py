"""Агрегированная статистика бота."""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, DateTime, Integer, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin


class BotVisitStat(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "bot_visit_stat"

    visit_date: Mapped[date] = mapped_column("date", Date, nullable=False, unique=True)
    unique_visitors: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    new_joins: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    bookings_started: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    bookings_completed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    bookings_abandoned: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ai_sessions: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
