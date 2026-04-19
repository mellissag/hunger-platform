"""Критерии сегмента рассылки (JSON в API)."""

from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

SegmentType = Literal[
    "all",
    "new_last_n",
    "dormant",
    "birthday_range",
    "by_service",
    "by_master",
    "vip",
    "regular",
    "by_tag",
    "by_lang",
    "no_show",
]


class SegmentCriteria(BaseModel):
    """Критерий сегмента + исключения (блэклист, отписка от маркетинга)."""

    type: SegmentType
    exclude_blacklist: bool = True
    exclude_marketing_opt_out: bool = True

    days: int | None = Field(default=None, description="new_last_n / dormant / birthday_range")
    days_ahead: int | None = Field(default=None, description="birthday_range: окно вперёд по календарю")
    service_id: UUID | None = None
    master_id: UUID | None = None
    top_percent: int | None = Field(default=None, ge=1, le=100, description="vip")
    min_bookings: int | None = Field(default=None, ge=1, description="regular")
    tag: str | None = Field(default=None, min_length=1)
    lang: str | None = Field(default=None, min_length=2, max_length=16)
    min_count: int | None = Field(default=1, ge=1, description="no_show")

    @field_validator("lang")
    @classmethod
    def norm_lang(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return v.split("-")[0].lower()

    @model_validator(mode="after")
    def required_by_type(self) -> SegmentCriteria:
        t = self.type
        if t == "new_last_n" and self.days is None:
            raise ValueError("days is required for new_last_n")
        if t == "dormant" and self.days is None:
            raise ValueError("days is required for dormant")
        if t == "birthday_range":
            if self.days_ahead is None:
                raise ValueError("days_ahead is required for birthday_range")
        if t == "by_service" and self.service_id is None:
            raise ValueError("service_id is required for by_service")
        if t == "by_master" and self.master_id is None:
            raise ValueError("master_id is required for by_master")
        if t == "vip" and self.top_percent is None:
            raise ValueError("top_percent is required for vip")
        if t == "regular" and self.min_bookings is None:
            raise ValueError("min_bookings is required for regular")
        if t == "by_tag" and not self.tag:
            raise ValueError("tag is required for by_tag")
        if t == "by_lang" and not self.lang:
            raise ValueError("lang is required for by_lang")
        return self

    def model_dump_for_storage(self) -> dict[str, Any]:
        return self.model_dump(mode="json")


class SegmentPreviewOut(BaseModel):
    count: int
