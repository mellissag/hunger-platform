"""Pydantic schemas for Telegram Mini App."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class InitDataPayload(BaseModel):
    tg_user_id: int
    first_name: str
    last_name: str | None = None
    username: str | None = None
    photo_url: str | None = None
    language_code: str | None = None
    start_param: str | None = None


class MiniAppServiceOut(BaseModel):
    id: str
    name_i18n: dict[str, Any]
    description_i18n: dict[str, Any]
    price: float
    duration_minutes: int
    duration_type: str
    duration_max_minutes: int | None
    photo_url: str | None
    category_id: str | None
    category_name_i18n: dict[str, Any]
    masters_count: int


class MiniAppMasterOut(BaseModel):
    id: str
    display_name: str
    bio: dict[str, Any]
    photo_url: str | None
    specialization: dict[str, Any]
    rating_avg: float | None
    rating_count: int
    services: list[dict[str, Any]] = []


class MiniAppSlotsResponse(BaseModel):
    date: str
    slots: list[str]


class MiniAppAvailabilityResponse(BaseModel):
    available_dates: list[str]


class MiniAppBookingCreate(BaseModel):
    service_id: str
    master_id: str | None = None
    starts_at: str | None = None  # ISO datetime string; None for consultation bookings
    needs_consultation: bool = False
    client_name: str | None = None
    client_phone: str | None = None
    notes: str | None = None
    comment: str | None = None
    any_master: bool = False
    call_for_time: bool = False
    promo_code: str | None = None


class MiniAppBookingOut(BaseModel):
    id: str
    status: str
    starts_at: str | None
    ends_at: str | None
    price: float
    duration_minutes: int | None = Field(
        default=None,
        description="Visit length from booking row (ends_at - starts_at), minutes.",
    )
    needs_consultation: bool = False
