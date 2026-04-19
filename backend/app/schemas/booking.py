"""Бронирования."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import BookingCreatedVia, BookingStatus, PrepaymentStatus


class BookingCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    client_id: UUID
    master_id: UUID
    service_id: UUID
    starts_at: datetime = Field(description="UTC")
    notes: str | None = None
    created_via: BookingCreatedVia = BookingCreatedVia.admin


class BookingUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    starts_at: datetime | None = None
    ends_at: datetime | None = None
    status: BookingStatus | None = None
    price: Decimal | None = Field(default=None, ge=0)
    notes: str | None = None
    prepayment_status: PrepaymentStatus | None = None


class BookingCancel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    actor: Literal["user", "client"] = "user"
    reason: str | None = None


class BookingReschedule(BaseModel):
    model_config = ConfigDict(extra="forbid")

    starts_at: datetime = Field(description="UTC")


class BookingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    client_id: UUID
    master_id: UUID
    service_id: UUID
    starts_at: datetime
    ends_at: datetime
    status: BookingStatus
    price: Decimal
    prepayment_amount: Decimal | None
    prepayment_status: PrepaymentStatus
    notes: str | None
    created_via: BookingCreatedVia
    created_at: datetime
    cancelled_at: datetime | None
    cancellation_reason: str | None
