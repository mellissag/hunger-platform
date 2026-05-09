"""Услуги и категории."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import validate_i18n_dict


class ServiceCategoryCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name_i18n: dict[str, str]
    icon: str | None = None
    sort_order: int = 0

    @field_validator("name_i18n")
    @classmethod
    def _names(cls, v: dict[str, str]) -> dict[str, str]:
        return validate_i18n_dict(v)


class ServiceCategoryUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name_i18n: dict[str, str] | None = None
    icon: str | None = None
    sort_order: int | None = None

    @field_validator("name_i18n")
    @classmethod
    def _names(cls, v: dict[str, str] | None) -> dict[str, str] | None:
        if v is None:
            return None
        return validate_i18n_dict(v)


class ServiceCategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name_i18n: dict[str, str]
    icon: str | None
    sort_order: int
    created_at: datetime


class ServiceCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category_id: UUID | None = None
    name_i18n: dict[str, str]
    description_i18n: dict[str, str] = Field(default_factory=dict)
    duration_minutes: int = Field(ge=1, le=24 * 60)
    duration_type: str = "fixed"
    duration_max_minutes: int | None = None
    price: Decimal = Field(ge=0)
    photo_url: str | None = None
    is_active: bool = True
    sort_order: int = 0

    @field_validator("name_i18n", "description_i18n")
    @classmethod
    def _i18n(cls, v: dict[str, str]) -> dict[str, str]:
        return validate_i18n_dict(v)


class ServiceUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category_id: UUID | None = None
    name_i18n: dict[str, str] | None = None
    description_i18n: dict[str, str] | None = None
    duration_minutes: int | None = Field(default=None, ge=1, le=24 * 60)
    duration_type: str | None = None
    duration_max_minutes: int | None = None
    price: Decimal | None = Field(default=None, ge=0)
    photo_url: str | None = None
    is_active: bool | None = None
    sort_order: int | None = None

    @field_validator("name_i18n", "description_i18n")
    @classmethod
    def _i18n(cls, v: dict[str, str] | None) -> dict[str, str] | None:
        if v is None:
            return None
        return validate_i18n_dict(v)


class ServiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    category_id: UUID | None
    name_i18n: dict[str, str]
    description_i18n: dict[str, str]
    duration_minutes: int
    duration_type: str
    duration_max_minutes: int | None
    price: Decimal
    photo_url: str | None
    is_active: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime
    masters_count: int | None = None
    bookings_30d: int | None = None


class ServiceStatsOut(BaseModel):
    """Сводка для блока KPI на странице услуг."""

    total: int
    active: int
    bookings_month: int
    avg_revenue: float
