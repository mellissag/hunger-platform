"""Color formula model."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
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
    from app.models.client import Client
    from app.models.master import Master


class ColorFormula(CreatedAtMixin, Base):
    __tablename__ = "color_formula"

    __table_args__ = (Index("ix_color_formula_client_id", "client_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    client_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("client.id", ondelete="CASCADE"), nullable=False
    )
    master_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("master.id", ondelete="SET NULL"), nullable=True
    )
    booking_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("booking.id", ondelete="SET NULL"), nullable=True
    )
    technique: Mapped[str | None] = mapped_column(String(100), nullable=True)
    brand: Mapped[str | None] = mapped_column(String(100), nullable=True)
    base_color: Mapped[str | None] = mapped_column(String(100), nullable=True)
    base_amount_ml: Mapped[Decimal | None] = mapped_column(Numeric(6, 1), nullable=True)
    mixer_color: Mapped[str | None] = mapped_column(String(100), nullable=True)
    mixer_amount_ml: Mapped[Decimal | None] = mapped_column(Numeric(6, 1), nullable=True)
    developer_percent: Mapped[str | None] = mapped_column(String(10), nullable=True)
    developer_ml: Mapped[Decimal | None] = mapped_column(Numeric(6, 1), nullable=True)
    processing_time_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    result_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    client: Mapped["Client"] = relationship("Client", backref="color_formulas")
    master: Mapped["Master | None"] = relationship("Master", backref="color_formulas")
