"""Категории услуг, услуги, связь мастер–услуга."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, Uuid, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.master import Master


class ServiceCategory(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "service_category"

    name_i18n: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    icon: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    services: Mapped[list["Service"]] = relationship(
        "Service",
        secondary="service_category_link",
        back_populates="categories",
        lazy="selectin",
    )


class ServiceCategoryLink(Base):
    """Связь многие-ко-многим услуга ↔ категория."""

    __tablename__ = "service_category_link"

    service_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("service.id", ondelete="CASCADE"),
        primary_key=True,
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("service_category.id", ondelete="CASCADE"),
        primary_key=True,
    )


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
    duration_type: Mapped[str] = mapped_column(String(10), nullable=False, default="fixed")
    duration_max_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    loyalty_points: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    category: Mapped[ServiceCategory | None] = relationship(
        "ServiceCategory",
        foreign_keys=[category_id],
    )
    categories: Mapped[list["ServiceCategory"]] = relationship(
        "ServiceCategory",
        secondary="service_category_link",
        back_populates="services",
        lazy="selectin",
    )
    master_services: Mapped[list["MasterService"]] = relationship(
        "MasterService",
        back_populates="service",
        passive_deletes=True,
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

    master: Mapped["Master"] = relationship("Master", back_populates="master_services")
    service: Mapped["Service"] = relationship("Service", back_populates="master_services")
