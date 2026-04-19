"""Салон + settings для админки (owner)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import LateCancellationPolicy, ThemePreset


class SalonOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: dict[str, Any]
    logo_url: str | None
    cover_url: str | None
    favicon_url: str | None
    contacts: dict[str, Any]
    timezone: str
    currency: str
    default_lang: str
    license_key: str | None


class SettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    theme: ThemePreset
    primary_color: str
    prepayment_enabled: bool
    prepayment_percent: int
    prepayment_min_amount: Decimal | None
    prepayment_skip_min_visits: int
    cancellation_free_hours: int
    late_cancellation_policy: LateCancellationPolicy
    fine_amount: Decimal | None
    reminder_intervals: list[float]
    reminder_message_templates: dict[str, Any]
    review_delay_hours: int
    working_hours_default: dict[str, Any]
    booking_lead_time_minutes: int
    booking_buffer_minutes: int
    ai_enabled: bool
    ai_system_prompt: dict[str, Any]
    ai_model: str | None
    ai_temperature: float
    ai_few_shot_examples: list[dict[str, Any]]
    ai_allow_booking: bool
    payment_provider_config: dict[str, Any] | None
    integrations: dict[str, Any]
    date_format: str
    time_format: str
    updated_at: datetime


class SalonBundleOut(BaseModel):
    salon: SalonOut
    settings: SettingsOut


class SalonPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(None, min_length=1, max_length=500)
    description: dict[str, Any] | None = None
    logo_url: str | None = None
    cover_url: str | None = None
    favicon_url: str | None = None
    contacts: dict[str, Any] | None = None
    timezone: str | None = Field(None, max_length=80)
    currency: str | None = Field(None, min_length=3, max_length=3)
    default_lang: str | None = Field(None, min_length=2, max_length=5)
    license_key: str | None = None


class SettingsPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    theme: ThemePreset | None = None
    primary_color: str | None = Field(None, max_length=32)
    prepayment_enabled: bool | None = None
    prepayment_percent: int | None = Field(None, ge=0, le=100)
    prepayment_min_amount: Decimal | None = None
    prepayment_skip_min_visits: int | None = Field(None, ge=0)
    cancellation_free_hours: int | None = Field(None, ge=0)
    late_cancellation_policy: LateCancellationPolicy | None = None
    fine_amount: Decimal | None = None
    reminder_intervals: list[float] | None = None
    reminder_message_templates: dict[str, Any] | None = None
    review_delay_hours: int | None = Field(None, ge=0)
    working_hours_default: dict[str, Any] | None = None
    booking_lead_time_minutes: int | None = Field(None, ge=0)
    booking_buffer_minutes: int | None = Field(None, ge=0)
    ai_enabled: bool | None = None
    ai_system_prompt: dict[str, Any] | None = None
    ai_model: str | None = None
    ai_temperature: float | None = Field(None, ge=0.0, le=2.0)
    ai_few_shot_examples: list[dict[str, Any]] | None = None
    ai_allow_booking: bool | None = None
    payment_provider_config: dict[str, Any] | None = None
    integrations: dict[str, Any] | None = None
    date_format: str | None = None
    time_format: str | None = None


class SalonBundlePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    salon: SalonPatch | None = None
    settings: SettingsPatch | None = None


class TelegramVerifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str | None = Field(None, max_length=200)


class TelegramVerifyResponse(BaseModel):
    ok: bool
    bot_username: str | None = None
    bot_id: int | None = None
    webhook_url: str | None = None


class BrandUploadResponse(BaseModel):
    kind: str
    path: str
    public_url: str
