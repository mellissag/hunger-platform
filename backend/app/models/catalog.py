"""Категории услуг, услуги, связь мастер–услуга."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, Text, Uuid, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin


class ServiceCategory(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "service_category"

    name_i18n: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    icon: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    services: Mapped[list["Service"]] = relationship("Service", back_populates="category")


class Service(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "service"

    category_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("service_category.id", ondelete="SET NULL"),
        nullable=True,
    )
    name_i18n: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    description_i18n: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    category: Mapped[ServiceCategory | None] = relationship(
        "ServiceCategory", back_populates="services"
    )


class MasterService(Base):
    __tablename__ = "master_service"

    master_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("master.id", ondelete="CASCADE"),
        primary_key=True,
    )
    service_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("service.id", ondelete="CASCADE"),
        primary_key=True,
    )
    price_override: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    duration_override: Mapped[int | None] = mapped_column(Integer, nullable=True)
