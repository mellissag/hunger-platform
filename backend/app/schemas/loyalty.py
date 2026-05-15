"""Схемы лояльности."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import (
    LoyaltyTransactionType,
    PromoDiscountType,
    ReferralRewardMode,
    ReferralTrigger,
)


class LoyaltySettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    referral_enabled: bool
    referral_reward_mode: ReferralRewardMode
    referral_trigger: ReferralTrigger
    referral_bonus_referrer: int
    referral_bonus_invited: int
    points_value_eur: Decimal


class LoyaltySettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    referral_enabled: bool | None = None
    referral_reward_mode: ReferralRewardMode | None = None
    referral_trigger: ReferralTrigger | None = None
    referral_bonus_referrer: int | None = Field(default=None, ge=0)
    referral_bonus_invited: int | None = Field(default=None, ge=0)
    points_value_eur: Decimal | None = Field(default=None, gt=0)


class ClientStatusCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name_ru: str
    name_en: str
    name_bg: str
    name_uk: str
    background_color: str = "#C9A84C"
    text_color: str = "#FFFFFF"
    discount_percent: int | None = Field(default=None, ge=0, le=100)
    points_multiplier: Decimal = Field(default=Decimal("1.0"), gt=0)
    min_visits: int | None = Field(default=None, ge=0)
    min_spent: Decimal | None = Field(default=None, ge=0)
    sort_order: int = 0


class ClientStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name_ru: str | None = None
    name_en: str | None = None
    name_bg: str | None = None
    name_uk: str | None = None
    background_color: str | None = None
    text_color: str | None = None
    discount_percent: int | None = Field(default=None, ge=0, le=100)
    points_multiplier: Decimal | None = Field(default=None, gt=0)
    min_visits: int | None = Field(default=None, ge=0)
    min_spent: Decimal | None = Field(default=None, ge=0)
    sort_order: int | None = None


class ClientStatusOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name_ru: str
    name_en: str
    name_bg: str
    name_uk: str
    background_color: str
    text_color: str
    discount_percent: int | None
    points_multiplier: Decimal
    min_visits: int | None
    min_spent: Decimal | None
    sort_order: int
    created_at: datetime


class ClientStatusReorder(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ids: list[UUID]


class PromoCodeCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    discount_type: PromoDiscountType
    discount_value: Decimal = Field(gt=0)
    min_booking_amount: Decimal | None = Field(default=None, ge=0)
    max_uses: int | None = Field(default=None, ge=1)
    max_uses_per_client: int | None = Field(default=1, ge=1)
    valid_from: date | None = None
    valid_until: date | None = None
    is_active: bool = True


class PromoCodeUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str | None = None
    discount_type: PromoDiscountType | None = None
    discount_value: Decimal | None = Field(default=None, gt=0)
    min_booking_amount: Decimal | None = None
    max_uses: int | None = None
    max_uses_per_client: int | None = None
    valid_from: date | None = None
    valid_until: date | None = None
    is_active: bool | None = None


class PromoCodeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    discount_type: PromoDiscountType
    discount_value: Decimal
    min_booking_amount: Decimal | None
    max_uses: int | None
    uses_count: int
    max_uses_per_client: int | None
    valid_from: date | None
    valid_until: date | None
    is_active: bool
    created_at: datetime


class PromoValidateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    booking_amount: Decimal = Field(ge=0)
    client_id: UUID | None = None


class PromoValidateOut(BaseModel):
    valid: bool
    code: str | None = None
    discount_type: PromoDiscountType | None = None
    discount_amount: Decimal | None = None
    discount_percent: Decimal | None = None
    final_amount: Decimal | None = None
    error: str | None = None


class LoyaltyTransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    client_id: UUID
    booking_id: UUID | None
    type: LoyaltyTransactionType
    points: int
    description: str
    created_at: datetime
    client_first_name: str | None = None
    client_last_name: str | None = None


class AdjustPointsIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    points: int
    description: str = Field(min_length=1, max_length=500)


class ReferralCodeOut(BaseModel):
    code: str
    uses_count: int
    link: str


class MeLoyaltyStatusOut(BaseModel):
    name: str
    background_color: str
    text_color: str
    discount_percent: int | None = None
    points_multiplier: Decimal


class MeLoyaltyOut(BaseModel):
    points: int
    points_value_eur: Decimal
    status: MeLoyaltyStatusOut | None = None
    referral_code: str | None = None
    referral_link: str | None = None
    referral_enabled: bool
    referral_bonus_referrer: int
    referral_bonus_invited: int
    referral_reward_mode: ReferralRewardMode
    next_status: MeLoyaltyStatusOut | None = None
    next_status_visits_remaining: int | None = None
    next_status_spent_remaining: Decimal | None = None


class MeLoyaltyTransactionOut(BaseModel):
    id: UUID
    type: LoyaltyTransactionType
    points: int
    description: str
    created_at: datetime
