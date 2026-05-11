"""Pydantic schemas for chat metadata (tags + notes)."""

from __future__ import annotations

import re
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


_HEX_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")


class ChatTagOut(BaseModel):
    id: UUID
    name: str
    color: str
    is_default: bool

    model_config = ConfigDict(from_attributes=True)


class ChatTagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    color: str = Field(min_length=7, max_length=7)

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name cannot be empty")
        return v

    @field_validator("color")
    @classmethod
    def _validate_color(cls, v: str) -> str:
        if not _HEX_COLOR_RE.match(v):
            raise ValueError("Color must be a 7-character hex string like '#C9A84C'")
        return v.upper()


class ChatNoteUpdate(BaseModel):
    note: str | None = Field(default=None, max_length=2_000)

    @field_validator("note")
    @classmethod
    def _trim(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        return v or None


class ChatTagAssign(BaseModel):
    tag_id: UUID


class ChatTagSummary(BaseModel):
    """Lightweight tag info embedded in chat list rows."""

    id: UUID
    name: str
    color: str

    model_config = ConfigDict(from_attributes=True)


class ChatTagAssignmentResponse(BaseModel):
    chat_id: UUID
    tag: ChatTagSummary
    assigned_at: datetime
