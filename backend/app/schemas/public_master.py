"""Public (unauthenticated) master profile for Mini App / widgets."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class PublicMasterServiceItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    service_id: str
    name_i18n: dict[str, Any]
    price: float
    duration_minutes: int
    duration_type: str
    duration_max_minutes: int | None = None


class PublicMasterReviewItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    client_name: str | None = None
    text: str | None = None
    rating: int = Field(ge=1, le=5)
    created_at: datetime


class PublicMasterCertificateItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    year: int | None = None
    photo_url: str | None = None


class PublicMasterProfileOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    display_name: str
    photo_url: str | None = None
    description: str = ""
    description_i18n: dict[str, str] = Field(default_factory=dict)
    specialization: str = ""
    specialization_i18n: dict[str, str] = Field(default_factory=dict)
    rating_avg: float | None = None
    rating_count: int = 0
    services: list[PublicMasterServiceItem] = Field(default_factory=list)
    reviews: list[PublicMasterReviewItem] = Field(default_factory=list)
    reviews_total: int = 0
    certificates: list[PublicMasterCertificateItem] = Field(default_factory=list)
    portfolio_urls: list[str] = Field(default_factory=list)
