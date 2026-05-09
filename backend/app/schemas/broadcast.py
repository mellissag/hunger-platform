"""Схемы REST для рассылок."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.models.enums import BroadcastStatus


class InlineKeyboardButtonIn(BaseModel):
    text: str = Field(min_length=1, max_length=64)
    url: str | None = None
    callback_data: str | None = Field(default=None, max_length=64)
    # "url" = open URL in browser; "mini_app" = open Telegram Mini App
    type: Literal["url", "mini_app"] = "url"

    @model_validator(mode="after")
    def url_or_callback(self) -> InlineKeyboardButtonIn:
        if self.type in ("url", "mini_app"):
            if not self.url:
                raise ValueError("url is required for url/mini_app button type")
        elif not self.callback_data:
            raise ValueError("callback_data is required for callback button type")
        return self


class InlineKeyboardIn(BaseModel):
    rows: list[list[InlineKeyboardButtonIn]] = Field(default_factory=list)


class BroadcastCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    message_i18n: dict[str, str]
    segment: dict[str, Any]
    media_url: str | None = None
    media_type: str | None = Field(default=None, pattern="^(photo|video|animation|video_note|voice)$")
    inline_keyboard: InlineKeyboardIn | None = None


class BroadcastUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    message_i18n: dict[str, str] | None = None
    segment: dict[str, Any] | None = None
    media_url: str | None = None
    media_type: str | None = Field(default=None, pattern="^(photo|video|animation|video_note|voice)$")
    inline_keyboard: InlineKeyboardIn | None = None


class BroadcastOut(BaseModel):
    id: UUID
    title: str
    message_i18n: dict[str, Any]
    segment: dict[str, Any]
    media_url: str | None
    media_type: str | None
    inline_keyboard: dict[str, Any] | None
    status: BroadcastStatus
    scheduled_at: datetime | None
    sent_at: datetime | None
    stats: dict[str, Any]
    created_by_user_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BroadcastSendBody(BaseModel):
    """Отправка: сразу или к времени (UTC)."""

    scheduled_at: datetime | None = None


class BroadcastListQuery(BaseModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
