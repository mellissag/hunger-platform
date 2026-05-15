"""Лояльность: статусы, промокоды, баллы, рефералы."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
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
)
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import (
    LoyaltyTransactionType,
    PromoDiscountType,
    ReferralRewardMode,
    ReferralTrigger,
)
from app.models.mixins import UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.booking import Booking
    from app.models.client import Client


class ClientStatus(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "client_status"

    name_ru: Mapped[str] = mapped_column(Text, nullable=False)
    name_en: Mapped[str] = mapped_column(Text, nullable=False)
    name_bg: Mapped[str] = mapped_column(Text, nullable=False)
    name_uk: Mapped[str] = mapped_column(Text, nullable=False)
    background_color: Mapped[str] = mapped_column(String(7), nullable=False, default="#C9A84C")
    text_color: Mapped[str] = mapped_column(String(7), nullable=False, default="#FFFFFF")
    discount_percent: Mapped[int | None] = mapped_column(Integer, nullable=True)
    points_multiplier: Mapped[Decimal] = mapped_column(Numeric(4, 2), nullable=False, default=Decimal("1.0"))
    min_visits: Mapped[int | None] = mapped_column(Integer, nullable=True)
    min_spent: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class LoyaltySettings(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "loyalty_settings"

    referral_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    referral_reward_mode: Mapped[ReferralRewardMode] = mapped_column(
        SQLEnum(
            ReferralRewardMode,
            name="referral_reward_mode",
            native_enum=True,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
        default=ReferralRewardMode.both,
    )
    referral_trigger: Mapped[ReferralTrigger] = mapped_column(
        SQLEnum(
            ReferralTrigger,
            name="referral_trigger",
            native_enum=True,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
        default=ReferralTrigger.on_first_visit,
    )
    referral_bonus_referrer: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    referral_bonus_invited: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    points_value_eur: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False, default=Decimal("0.01"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class PromoCode(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "promo_code"

    code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    discount_type: Mapped[PromoDiscountType] = mapped_column(
        SQLEnum(
            PromoDiscountType,
            name="promo_discount_type",
            native_enum=True,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
    )
    discount_value: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    min_booking_amount: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    max_uses: Mapped[int | None] = mapped_column(Integer, nullable=True)
    uses_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_uses_per_client: Mapped[int | None] = mapped_column(Integer, nullable=True, default=1)
    valid_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    valid_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class LoyaltyTransaction(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "loyalty_transaction"

    client_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("client.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    booking_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("booking.id", ondelete="SET NULL"),
        nullable=True,
    )
    type: Mapped[LoyaltyTransactionType] = mapped_column(
        SQLEnum(
            LoyaltyTransactionType,
            name="loyalty_transaction_type",
            native_enum=True,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
    )
    points: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    client: Mapped["Client"] = relationship("Client", foreign_keys=[client_id])
    booking: Mapped["Booking | None"] = relationship("Booking", foreign_keys=[booking_id])


class ReferralCode(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "referral_code"

    client_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("client.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    code: Mapped[str] = mapped_column(String(8), unique=True, nullable=False)
    uses_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    client: Mapped["Client"] = relationship("Client", foreign_keys=[client_id])
