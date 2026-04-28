from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class InlineButton(BaseModel):
    text: str
    url: str


class BroadcastRecipientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    client_id: UUID
    client_name: Optional[str] = None
    status: str
    error_reason: Optional[str] = None
    sent_at: Optional[datetime] = None


class AutoTriggerCreate(BaseModel):
    type: str = Field(min_length=1)
    is_active: bool = True
    delay_hours: int = Field(default=3, ge=0, le=24 * 30)
    template_text: str = Field(min_length=1)
    photo_url: Optional[str] = None
    buttons: list[InlineButton] = Field(default_factory=list)
    master_id: Optional[UUID] = None


class AutoTriggerUpdate(BaseModel):
    is_active: Optional[bool] = None
    delay_hours: Optional[int] = Field(default=None, ge=0, le=24 * 30)
    template_text: Optional[str] = None
    photo_url: Optional[str] = None
    buttons: Optional[list[InlineButton]] = None
    master_id: Optional[UUID] = None


class AutoTriggerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    type: str
    is_active: bool
    delay_hours: int
    template_text: str
    photo_url: Optional[str] = None
    buttons: list[InlineButton] = Field(default_factory=list)
    master_id: Optional[UUID] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    @field_validator("buttons", mode="before")
    @classmethod
    def coerce_buttons(cls, v: object) -> list:
        if v is None:
            return []
        return v  # type: ignore[return-value]
