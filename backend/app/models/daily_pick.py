"""Подборка дня — управляется через Admin Panel."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Numeric, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class DailyPick(Base):
    __tablename__ = "daily_picks"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    service_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("service.id", ondelete="SET NULL"),
        nullable=True,
    )

    title_ru: Mapped[str | None] = mapped_column(String(200), nullable=True)
    title_en: Mapped[str | None] = mapped_column(String(200), nullable=True)
    title_uk: Mapped[str | None] = mapped_column(String(200), nullable=True)
    title_bg: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Comma-separated tags per language
    tags_ru: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags_en: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags_uk: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags_bg: Mapped[str | None] = mapped_column(Text, nullable=True)

    button_text_ru: Mapped[str | None] = mapped_column(String(200), nullable=True)
    button_text_en: Mapped[str | None] = mapped_column(String(200), nullable=True)
    button_text_uk: Mapped[str | None] = mapped_column(String(200), nullable=True)
    button_text_bg: Mapped[str | None] = mapped_column(String(200), nullable=True)

    button_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # "url" — open in browser; "mini_app" — open inside Telegram (WebApp APIs)
    button_type: Mapped[str] = mapped_column(String(20), nullable=False, server_default="url")

    price: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    valid_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    valid_to: Mapped[date | None] = mapped_column(Date, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    service: Mapped["DailyPick | None"] = relationship(
        "Service", foreign_keys=[service_id], lazy="joined"
    )
