"""Схемы мастеров (Phase 20)."""

from __future__ import annotations

import os
from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

from pydantic import AliasChoices, BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.schemas.common import validate_i18n_dict

BASE_URL = os.environ.get("BASE_URL", "https://test-adm.tech").rstrip("/")


def _to_absolute(v: str | None) -> str | None:
    if not v:
        return v
    if v.startswith("http://") or v.startswith("https://"):
        return v
    return f"{BASE_URL}{v if v.startswith('/') else f'/{v}'}"


class WorkingDaySchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled: bool = True
    start: str = "10:00"
    end: str = "19:00"


class WorkingHoursSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mon: WorkingDaySchema = Field(default_factory=WorkingDaySchema)
    tue: WorkingDaySchema = Field(default_factory=WorkingDaySchema)
    wed: WorkingDaySchema = Field(default_factory=WorkingDaySchema)
    thu: WorkingDaySchema = Field(default_factory=WorkingDaySchema)
    fri: WorkingDaySchema = Field(default_factory=WorkingDaySchema)
    sat: WorkingDaySchema = Field(default_factory=lambda: WorkingDaySchema(enabled=False))
    sun: WorkingDaySchema = Field(default_factory=lambda: WorkingDaySchema(enabled=False))


class MasterServiceSlimOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str


class CertificateItem(BaseModel):
    """Квалификация / сертификат (JSONB)."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=500)
    photo_url: str | None = None
    year: int | None = Field(default=None, ge=1900, le=2100)

    @field_validator("photo_url", mode="before")
    @classmethod
    def _photo_abs(cls, v: str | None) -> str | None:
        return _to_absolute(v)


def _normalize_certificates_list(raw: list[Any] | None) -> list[dict[str, Any]]:
    """Старые данные: массив строк; новый формат: объекты."""
    if not raw:
        return []
    out: list[dict[str, Any]] = []
    for item in raw:
        if isinstance(item, CertificateItem):
            out.append(item.model_dump())
            continue
        if isinstance(item, str):
            title = item.strip()
            if not title:
                continue
            c = CertificateItem(
                id=uuid4().hex,
                title=title,
                photo_url=None,
                year=None,
            )
            out.append(c.model_dump())
        elif isinstance(item, dict):
            cid = str(item.get("id") or "").strip() or uuid4().hex
            title = (item.get("title") or "").strip() if "title" in item else str(item.get("name") or "").strip()
            if not title and isinstance(item.get("t"), str):
                title = item["t"].strip()  # legacy
            if not title:
                continue
            c = CertificateItem(
                id=cid,
                title=title,
                photo_url=item.get("photo_url"),
                year=item.get("year"),
            )
            out.append(c.model_dump())
    return out


class MasterBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str = Field(min_length=1, max_length=500)
    bio: dict[str, str] = Field(default_factory=dict)
    specialization: dict[str, str] = Field(default_factory=dict)
    photo_url: str | None = None
    color_hex: str = Field(default="#D97757", pattern=r"^#[0-9A-Fa-f]{6}$")
    sort_order: int = 0
    is_active: bool = True
    payroll_percent: Decimal = Field(default=Decimal("40.00"), ge=Decimal("0"), le=Decimal("100"))

    @field_validator("bio", "specialization")
    @classmethod
    def _i18n_maps(cls, v: dict[str, str]) -> dict[str, str]:
        if not v:
            return {k: "" for k in ("en", "ru", "uk", "bg")}
        return validate_i18n_dict(v)

    @field_validator("photo_url", mode="before")
    @classmethod
    def _master_photo_abs(cls, v: str | None) -> str | None:
        return _to_absolute(v)


class MasterCreate(MasterBase):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=128)
    tg_user_id: int | None = None
    certificates: list[CertificateItem] = Field(default_factory=list)
    service_ids: list[UUID] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def _certs_from_legacy(cls, data: Any) -> Any:  # noqa: ANN401
        if not isinstance(data, dict):
            return data
        certs = data.get("certificates")
        if certs is None:
            return data
        d = dict(data)
        d["certificates"] = _normalize_certificates_list(certs)  # type: ignore[assignment]
        return d


class MasterUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str | None = Field(default=None, min_length=1, max_length=500)
    bio: dict[str, str] | None = None
    specialization: dict[str, str] | None = None
    photo_url: str | None = None
    color_hex: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    sort_order: int | None = None
    is_active: bool | None = None
    payroll_percent: Decimal | None = Field(default=None, ge=Decimal("0"), le=Decimal("100"))
    tg_user_id: int | None = None
    certificates: list[CertificateItem] | None = None

    @model_validator(mode="before")
    @classmethod
    def _certs_from_legacy_update(cls, data: Any) -> Any:  # noqa: ANN401
        if not isinstance(data, dict):
            return data
        if "certificates" not in data or data["certificates"] is None:
            return data
        d = dict(data)
        d["certificates"] = _normalize_certificates_list(data["certificates"])  # type: ignore[assignment]
        return d

    @field_validator("bio", "specialization")
    @classmethod
    def _i18n_maps(cls, v: dict[str, str] | None) -> dict[str, str] | None:
        if v is None:
            return None
        if not v:
            return {k: "" for k in ("en", "ru", "uk", "bg")}
        return validate_i18n_dict(v)


class MasterCredentialsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr | None = None
    password: str | None = Field(default=None, min_length=6, max_length=128)


class MasterServiceUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    service_id: UUID
    price_override: Decimal | None = Field(default=None, ge=Decimal("0"))
    duration_override: int | None = Field(default=None, ge=1)


class MasterServiceRowOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    service_id: UUID
    price_override: Decimal | None = None
    duration_override: int | None = None
    service_name: str


class ReviewCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rating: int = Field(..., ge=1, le=5)
    text: str | None = None
    client_id: UUID | None = None
    photo_url: str | None = None
    source: str = Field(default="manual", max_length=20)


class ManualBookingCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    client_id: UUID
    service_id: UUID
    starts_at: datetime = Field(description="UTC")
    note: str | None = None


class PasswordResetData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    new_password: str = Field(min_length=8, max_length=128)


class MasterOut(MasterBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    rating_avg: Decimal | None
    rating_count: int
    created_at: datetime
    updated_at: datetime
    tg_user_id: int | None = None
    certificates: list[Any] = Field(default_factory=list)
    working_hours: dict[str, Any] = Field(default_factory=dict)
    portfolio: list[Any] = Field(default_factory=list)
    services: list[MasterServiceSlimOut] = Field(default_factory=list)
    user_email: str | None = None

    @classmethod
    def from_orm_with_services(cls, m: Any, locale: str = "ru") -> MasterOut:
        services: list[MasterServiceSlimOut] = []
        for row in getattr(m, "master_services", []) or []:
            svc = getattr(row, "service", None)
            if svc is None:
                continue
            name_i18n = svc.name_i18n if isinstance(svc.name_i18n, dict) else {}
            name = str(name_i18n.get(locale) or name_i18n.get("en") or name_i18n.get("ru") or "—")
            services.append(MasterServiceSlimOut(id=svc.id, name=name))
        base = MasterBase.model_validate(m, from_attributes=True)
        return cls(
            **base.model_dump(),
            id=m.id,
            rating_avg=m.rating_avg,
            rating_count=m.rating_count,
            created_at=m.created_at,
            updated_at=m.updated_at,
            tg_user_id=m.tg_user_id,
            certificates=list(m.certificates or []),
            working_hours=dict(m.working_hours or {}),
            portfolio=list(m.portfolio or []),
            services=services,
            user_email=(m.users[0].email if getattr(m, "users", None) else None),
        )


class PhotoUrlOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    photo_url: str


class PortfolioListOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[dict[str, Any]]


class MasterServicesPutResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    updated: int


class ReviewClientBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str | None = None


class ReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    master_id: UUID
    client_id: UUID | None
    booking_id: UUID | None
    rating: int
    text: str | None = Field(
        default=None,
        validation_alias=AliasChoices("text", "comment"),
    )
    photo_url: str | None = None
    source: str
    is_visible: bool
    created_at: datetime
    client: ReviewClientBrief | None = None

    @field_validator("photo_url", mode="before")
    @classmethod
    def _review_photo_abs(cls, v: str | None) -> str | None:
        return _to_absolute(v)


class ReviewsPageOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[ReviewOut]
    total: int
    avg: float | None
    breakdown: dict[str, int]


class MasterStatsOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    total_bookings: int
    completed_bookings: int
    cancelled_bookings: int
    revenue: float
    avg_check: float | None
    no_show_count: int
    top_services: list[dict[str, Any]]
    bookings_by_month: list[dict[str, Any]]
    rating_avg: float | None
    rating_count: int
    unique_clients: int
    repeat_clients: int


class MastersTodayStatsOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    bookings_today: int
    revenue_month: float
