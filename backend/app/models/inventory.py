"""Inventory models: Product, SupplyInvoice, SupplyInvoiceItem, ProductWriteOff."""

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
    pass


class Product(CreatedAtMixin, Base):
    __tablename__ = "product"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    brand: Mapped[str | None] = mapped_column(String(100), nullable=True)
    sku: Mapped[str | None] = mapped_column(String(100), nullable=True)
    unit: Mapped[str] = mapped_column(String(20), nullable=False, server_default="шт")
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    min_stock: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, server_default="0")
    current_stock: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, server_default="0")
    cost_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")

    invoice_items: Mapped[list["SupplyInvoiceItem"]] = relationship(
        "SupplyInvoiceItem", back_populates="product", lazy="select"
    )
    write_offs: Mapped[list["ProductWriteOff"]] = relationship(
        "ProductWriteOff", back_populates="product", lazy="select"
    )


class SupplyInvoice(CreatedAtMixin, Base):
    __tablename__ = "supply_invoice"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    invoice_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    supplier: Mapped[str | None] = mapped_column(String(200), nullable=True)
    arrived_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    total_cost: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    received_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )

    items: Mapped[list["SupplyInvoiceItem"]] = relationship(
        "SupplyInvoiceItem",
        back_populates="invoice",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class SupplyInvoiceItem(Base):
    __tablename__ = "supply_invoice_item"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    invoice_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("supply_invoice.id", ondelete="CASCADE"), nullable=False
    )
    product_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("product.id", ondelete="RESTRICT"), nullable=False
    )
    quantity: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    price_per_unit: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    total: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    invoice: Mapped["SupplyInvoice"] = relationship("SupplyInvoice", back_populates="items")
    product: Mapped["Product"] = relationship("Product", back_populates="invoice_items")


class ProductWriteOff(CreatedAtMixin, Base):
    __tablename__ = "product_write_off"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
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
    written_off_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    product: Mapped["Product"] = relationship("Product", back_populates="write_offs")
