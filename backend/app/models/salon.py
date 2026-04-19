"""Салон и настройки (1:1)."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    Uuid,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, REAL
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import LateCancellationPolicy, ThemePreset
from app.models.mixins import CreatedAtMixin, UUIDPrimaryKeyMixin


class Salon(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "salon"

    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    logo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    cover_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    timezone: Mapped[str] = mapped_column(Text, nullable=False, default="Europe/Sofia")
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="EUR")
    default_lang: Mapped[str] = mapped_column(String(5), nullable=False, default="en")
    license_key: Mapped[str | None] = mapped_column(Text, nullable=True, unique=True)

    settings: Mapped["Settings | None"] = relationship(
        "Settings",
        back_populates="salon",
        uselist=False,
        cascade="all, delete-orphan",
    )


class Settings(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "settings"

    salon_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("salon.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    theme: Mapped[ThemePreset] = mapped_column(
        SQLEnum(
            ThemePreset,
            name="theme_preset",
            native_enum=True,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
        default=ThemePreset.friendly,
    )
    primary_color: Mapped[str] = mapped_column(Text, nullable=False, default="#D97757")

    prepayment_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    prepayment_percent: Mapped[int] = mapped_column(Integer, nullable=False, default=20)

    cancellation_free_hours: Mapped[int] = mapped_column(Integer, nullable=False, default=24)
    late_cancellation_policy: Mapped[LateCancellationPolicy] = mapped_column(
        SQLEnum(
            LateCancellationPolicy,
            name="late_cancellation_policy",
            native_enum=True,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
        default=LateCancellationPolicy.no_cancel,
    )
    fine_amount: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)

    reminder_intervals: Mapped[list[float]] = mapped_column(
        ARRAY(REAL()),
        nullable=False,
        server_default=text("'{24,2,0.5}'::real[]"),
    )
    review_delay_hours: Mapped[int] = mapped_column(Integer, nullable=False, default=2)

    working_hours_default: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    booking_lead_time_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    booking_buffer_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=5)

    ai_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    ai_system_prompt: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    ai_model: Mapped[str | None] = mapped_column(Text, nullable=True, default="gemini-1.5-flash")
    ai_allow_booking: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    payment_provider_config: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    salon: Mapped[Salon] = relationship("Salon", back_populates="settings")
