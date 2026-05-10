"""Бронирования, отзывы, блэклист."""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    SmallInteger,
    Text,
    Uuid,
    func,
)
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import BookingCreatedVia, BookingStatus, PrepaymentStatus
from app.models.mixins import CreatedAtMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.catalog import Service
    from app.models.client import Client
    from app.models.master import Master


class Booking(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "booking"

    __table_args__ = (
        Index("ix_booking_master_starts", "master_id", "starts_at"),
        Index(
            "ix_booking_client_starts",
            "client_id",
            "starts_at",
            postgresql_ops={"starts_at": "DESC"},
        ),
        Index("ix_booking_status_starts", "status", "starts_at"),
    )

    client_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("client.id", ondelete="RESTRICT"),
        nullable=False,
    )
    master_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("master.id", ondelete="RESTRICT"),
        nullable=True,
    )
    service_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("service.id", ondelete="RESTRICT"),
        nullable=False,
    )
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    needs_consultation: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[BookingStatus] = mapped_column(
        SQLEnum(
            BookingStatus,
            name="booking_status",
            native_enum=True,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
        default=BookingStatus.pending,
    )
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    prepayment_amount: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    prepayment_status: Mapped[PrepaymentStatus] = mapped_column(
        SQLEnum(
            PrepaymentStatus,
            name="prepayment_status",
            native_enum=True,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
        default=PrepaymentStatus.none,
    )
    payment_provider_ref: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    client_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    any_master: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    call_for_time: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_via: Mapped[BookingCreatedVia] = mapped_column(
        SQLEnum(
            BookingCreatedVia,
            name="booking_created_via",
            native_enum=True,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
        default=BookingCreatedVia.bot,
    )
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancellation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    reminder_sent_24h: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    reminder_sent_2h: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    reminder_sent_30m: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    review_sent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    review: Mapped["Review | None"] = relationship(
        "Review",
        back_populates="booking",
        uselist=False,
        foreign_keys="Review.booking_id",
    )
    service: Mapped["Service | None"] = relationship("Service", foreign_keys=[service_id])
    master: Mapped["Master | None"] = relationship("Master", foreign_keys=[master_id])
    client: Mapped["Client"] = relationship("Client", foreign_keys=[client_id])


class Review(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "review"

    __table_args__ = (
        CheckConstraint("rating >= 1 AND rating <= 5", name="ck_review_rating_range"),
    )

    booking_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("booking.id", ondelete="SET NULL"),
        nullable=True,
    )
    client_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("client.id", ondelete="SET NULL"),
        nullable=True,
    )
    master_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("master.id", ondelete="CASCADE"),
        nullable=False,
    )
    rating: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(Text, nullable=False, default="bot")
    is_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    booking: Mapped["Booking | None"] = relationship(
        "Booking",
        back_populates="review",
        foreign_keys=[booking_id],
    )


class BlacklistEntry(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "blacklist_entry"

    client_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("client.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    added_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("user.id", ondelete="SET NULL"),
        nullable=True,
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
