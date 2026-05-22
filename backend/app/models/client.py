"""Клиенты и заметки."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
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
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import ClientSource
from app.models.mixins import UUIDPrimaryKeyMixin
from sqlalchemy import Enum as SQLEnum

if TYPE_CHECKING:
    from app.models.chat_message import ChatMessage
    from app.models.user import User


class Client(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "client"

    tg_user_id: Mapped[int | None] = mapped_column(BigInteger, unique=True, nullable=True)
    tg_username: Mapped[str | None] = mapped_column(Text, nullable=True)
    phone: Mapped[str | None] = mapped_column(Text, nullable=True)
    whatsapp_phone: Mapped[str | None] = mapped_column(Text, nullable=True)
    instagram_user_id: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    first_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    city: Mapped[str | None] = mapped_column(Text, nullable=True)
    birthday: Mapped[date | None] = mapped_column(Date, nullable=True)
    lang: Mapped[str] = mapped_column(Text, nullable=False, default="en")
    theme: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
        default="light",
        server_default="light",
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    source: Mapped[ClientSource] = mapped_column(
        SQLEnum(
            ClientSource,
            name="client_source",
            native_enum=True,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
        default=ClientSource.bot,
    )
    total_bookings: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_revenue: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    no_show_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_visit_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    tags: Mapped[list[str]] = mapped_column(
        ARRAY(Text), nullable=False, server_default=text("'{}'::text[]")
    )
    joined_bot_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_bot_activity_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    total_bot_sessions: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    bot_blocked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    funnel_stats: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("'{}'::jsonb"),
        # DB must have the same server default; if it was missing, INSERT still needs a value:
        insert_default=dict,
    )
    prefers_no_ai: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    marketing_opted_out: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    loyalty_points: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("client_status.id", ondelete="SET NULL"),
        nullable=True,
    )
    status_assigned_manually: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    total_visits: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_spent: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    referred_by_client_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("client.id", ondelete="SET NULL"),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    notes: Mapped[list["ClientNote"]] = relationship(
        "ClientNote",
        back_populates="client",
        cascade="all, delete-orphan",
    )
    chat_messages: Mapped[list["ChatMessage"]] = relationship(
        "ChatMessage",
        back_populates="client",
        cascade="all, delete-orphan",
        order_by="ChatMessage.created_at",
    )


class ClientNote(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "client_note"

    client_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("client.id", ondelete="CASCADE"),
        nullable=False,
    )
    author_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("user.id", ondelete="SET NULL"),
        nullable=True,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    client: Mapped[Client] = relationship("Client", back_populates="notes")
    author: Mapped["User | None"] = relationship("User", foreign_keys=[author_user_id])
