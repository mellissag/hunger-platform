"""Inventory models: Product, ProductArrival, ProductWriteOff."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

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
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import CreatedAtMixin

if TYPE_CHECKING:
    from app.models.booking import Booking
    from app.models.master import Master
    from app.models.user import User


class Product(CreatedAtMixin, Base):
    __tablename__ = "product"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    brand: Mapped[str | None] = mapped_column(String(100), nullable=True)
    sku: Mapped[str | None] = mapped_column(String(100), nullable=True)
    unit: Mapped[str] = mapped_column(String(20), nullable=False, server_default="шт")
    min_stock: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, server_default="0")
    current_stock: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, server_default="0")
    price_per_unit: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")

    arrivals: Mapped[list["ProductArrival"]] = relationship(
        "ProductArrival", back_populates="product", lazy="select"
    )
    write_offs: Mapped[list["ProductWriteOff"]] = relationship(
        "ProductWriteOff", back_populates="product", lazy="select"
    )


class ProductArrival(CreatedAtMixin, Base):
    __tablename__ = "product_arrival"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    arrived_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    product_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("product.id", ondelete="RESTRICT"), nullable=False
    )
    quantity: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    price_per_unit: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    total_cost: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    supplier: Mapped[str | None] = mapped_column(String(200), nullable=True)
    invoice_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    received_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    product: Mapped["Product"] = relationship("Product", back_populates="arrivals")


class ProductWriteOff(CreatedAtMixin, Base):
    __tablename__ = "product_write_off"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    written_off_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    product_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("product.id", ondelete="RESTRICT"), nullable=False
    )
    quantity: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    reason: Mapped[str | None] = mapped_column(String(200), nullable=True)
    booking_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("booking.id", ondelete="SET NULL"), nullable=True
    )
    master_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("master.id", ondelete="SET NULL"), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    product: Mapped["Product"] = relationship("Product", back_populates="write_offs")
