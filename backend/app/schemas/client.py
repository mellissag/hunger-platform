"""Схемы клиентов."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import ClientSource
from app.schemas.client_note import ClientNoteOut


class ClientBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    phone: str | None = None
    first_name: str | None = None  # переопределяется в ClientCreate как обязательное
    last_name: str | None = None
    city: str | None = None
    birthday: date | None = None
    lang: str = "en"
    tags: list[str] = Field(default_factory=list)


class ClientCreate(ClientBase):
    first_name: str = Field(..., min_length=1, max_length=200)
    tg_user_id: int | None = None
    tg_username: str | None = None
    source: ClientSource = ClientSource.manual


class ClientUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    phone: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    city: str | None = None
    tg_user_id: int | None = None
    tg_username: str | None = None
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
    joined_bot_at: datetime | None = None
    last_bot_activity_at: datetime | None = None
    total_bot_sessions: int = 0
    bot_blocked: bool = False
    total_bookings: int
    total_revenue: Decimal
    no_show_count: int
    last_visit_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ClientStatsOut(BaseModel):
    total: int
    new_month: int
    avg_ltv: float


class ClientBookingHistoryOut(BaseModel):
    id: UUID
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    status: str
    price: Decimal
    service_name: str
    master_name: str


class ClientReviewOut(BaseModel):
    id: UUID
    rating: int
    comment: str | None
    created_at: datetime
    master_name: str


class BlacklistEntrySlimOut(BaseModel):
    id: UUID
    reason: str | None
    created_at: datetime


class ClientFunnelStatsOut(BaseModel):
    started_booking: int = 0
    completed_booking: int = 0
    abandoned_booking: int = 0
    ai_sessions: int = 0


class ClientBroadcastHistoryOut(BaseModel):
    broadcast_id: UUID
    broadcast_title: str
    sent_at: datetime | None
    status: str


class ClientAIDialogOut(BaseModel):
    id: UUID
    started_at: datetime
    preview: str | None = None


class SendMessageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(..., min_length=1, max_length=4096)
    parse_mode: str = Field(default="HTML", max_length=32)


class ClientDetailOut(ClientOut):
    notes: list[ClientNoteOut]
    bookings: list[ClientBookingHistoryOut]
    reviews: list[ClientReviewOut]
    blacklist_entry: BlacklistEntrySlimOut | None
    avg_check: Decimal = Decimal(0)
    favourite_service: str | None = None
    favourite_master: str | None = None
    funnel_stats: ClientFunnelStatsOut = Field(default_factory=ClientFunnelStatsOut)
    bot_language: str = "en"
    ai_dialogs: list[ClientAIDialogOut] = Field(default_factory=list)
    broadcasts: list[ClientBroadcastHistoryOut] = Field(default_factory=list)


class SendMessageResponse(BaseModel):
    ok: bool = True
    message: str


class ResolveTelegramResponse(BaseModel):
    ok: bool = True
    updated: dict[str, str]
