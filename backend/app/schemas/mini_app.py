"""Pydantic schemas for Telegram Mini App."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class InitDataPayload(BaseModel):
    tg_user_id: int
    first_name: str
    last_name: str | None = None
    username: str | None = None
    photo_url: str | None = None
    language_code: str | None = None


class MiniAppServiceOut(BaseModel):
    id: str
    name_i18n: dict[str, Any]
    description_i18n: dict[str, Any]
    price: float
    duration_minutes: int
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
    master_id: str
    service_id: str
    starts_at: str  # ISO datetime string


class MiniAppBookingOut(BaseModel):
    id: str
    status: str
    starts_at: str
    ends_at: str
    price: float
