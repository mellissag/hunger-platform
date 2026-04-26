"""Color formula model with JSONB components."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, TYPE_CHECKING

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
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
    components: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, default=list)
    service_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    applied_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    result_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    exposure_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    photo_urls: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True, default=list)
    client_rating: Mapped[int | None] = mapped_column(Integer, nullable=True)

    client: Mapped["Client"] = relationship("Client", backref="color_formulas")
    master: Mapped["Master | None"] = relationship("Master", backref="color_formulas")
