"""Чёрный список — админ API."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class BlacklistEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    client_id: UUID
    client_name: str | None
    phone: str | None
    tg_username: str | None
    reason: str | None
    created_at: datetime
    expires_at: datetime | None


class BlacklistCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    client_id: UUID
    reason: str | None = Field(None, max_length=2000)
    expires_at: datetime | None = None


class BlacklistPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str | None = Field(None, max_length=2000)
    expires_at: datetime | None = None
