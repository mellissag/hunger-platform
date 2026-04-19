"""Расписание мастеров."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, Text, Uuid
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import SlotType
from app.models.mixins import CreatedAtMixin, UUIDPrimaryKeyMixin


class ScheduleSlot(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "schedule_slot"

    __table_args__ = (Index("ix_schedule_slot_master_starts", "master_id", "starts_at"),)

    master_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("master.id", ondelete="CASCADE"),
        nullable=False,
    )
    slot_type: Mapped[SlotType] = mapped_column(
        "type",
        SQLEnum(
            SlotType,
            name="slot_type",
            native_enum=True,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
    )
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    recurrence: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
