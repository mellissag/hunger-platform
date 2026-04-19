"""Схемы клиентов."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import ClientSource


class ClientBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    phone: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    birthday: date | None = None
    lang: str = "en"
    tags: list[str] = Field(default_factory=list)


class ClientCreate(ClientBase):
    tg_user_id: int | None = None
    tg_username: str | None = None
    source: ClientSource = ClientSource.manual


class ClientUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    phone: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    birthday: date | None = None
    lang: str | None = None
    tags: list[str] | None = None


class ClientOut(ClientBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tg_user_id: int | None
    tg_username: str | None
    source: ClientSource
    joined_at: datetime
    total_bookings: int
    total_revenue: Decimal
    no_show_count: int
    last_visit_at: datetime | None
    created_at: datetime
    updated_at: datetime
