"""Заметки о клиенте."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ClientNoteCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str = Field(..., min_length=1, max_length=20000)


class ClientNoteUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str = Field(..., min_length=1, max_length=20000)


class ClientNotePinBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pinned: bool = True


class ClientNoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    client_id: UUID
    author_user_id: UUID | None
    author_display_name: str | None
    content: str
    pinned: bool
    created_at: datetime
    updated_at: datetime
