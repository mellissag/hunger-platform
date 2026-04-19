"""Схемы мастеров."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import validate_i18n_dict


class MasterBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str = Field(min_length=1, max_length=500)
    bio: dict[str, str] = Field(default_factory=dict)
    specialization: dict[str, str] = Field(default_factory=dict)
    photo_url: str | None = None
    color_hex: str = Field(default="#D97757", pattern=r"^#[0-9A-Fa-f]{6}$")
    sort_order: int = 0
    is_active: bool = True

    @field_validator("bio", "specialization")
    @classmethod
    def _i18n_maps(cls, v: dict[str, str]) -> dict[str, str]:
        if not v:
            return {k: "" for k in ("en", "ru", "uk", "bg")}
        return validate_i18n_dict(v)


class MasterCreate(MasterBase):
    pass


class MasterUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str | None = Field(default=None, min_length=1, max_length=500)
    bio: dict[str, str] | None = None
    specialization: dict[str, str] | None = None
    photo_url: str | None = None
    color_hex: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    sort_order: int | None = None
    is_active: bool | None = None

    @field_validator("bio", "specialization")
    @classmethod
    def _i18n_maps(cls, v: dict[str, str] | None) -> dict[str, str] | None:
        if v is None:
            return None
        if not v:
            return {k: "" for k in ("en", "ru", "uk", "bg")}
        return validate_i18n_dict(v)


class MasterOut(MasterBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    rating_avg: Decimal | None
    rating_count: int
    created_at: datetime
    updated_at: datetime
