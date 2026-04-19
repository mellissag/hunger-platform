"""Рассылки."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Text, Uuid, func, text
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import BroadcastRecipientStatus, BroadcastStatus
from app.models.mixins import UUIDPrimaryKeyMixin


class Broadcast(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "broadcast"

    title: Mapped[str] = mapped_column(Text, nullable=False)
    message_i18n: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    media_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    segment: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    status: Mapped[BroadcastStatus] = mapped_column(
        SQLEnum(
            BroadcastStatus,
            name="broadcast_status",
            native_enum=True,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
        default=BroadcastStatus.draft,
    )
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=False,
    )
    stats: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    recipients: Mapped[list["BroadcastRecipient"]] = relationship(
        "BroadcastRecipient",
        back_populates="broadcast",
        cascade="all, delete-orphan",
    )


class BroadcastRecipient(Base):
    __tablename__ = "broadcast_recipient"

    broadcast_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("broadcast.id", ondelete="CASCADE"),
        primary_key=True,
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("client.id", ondelete="CASCADE"),
        primary_key=True,
    )
    status: Mapped[BroadcastRecipientStatus] = mapped_column(
        SQLEnum(
            BroadcastRecipientStatus,
            name="broadcast_recipient_status",
            native_enum=True,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
        default=BroadcastRecipientStatus.sent,
    )
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    broadcast: Mapped[Broadcast] = relationship("Broadcast", back_populates="recipients")
