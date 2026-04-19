"""Схемы kb_document."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import KBSourceType


class KBDocumentBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(..., min_length=1, max_length=500)
    source_type: KBSourceType = KBSourceType.manual
    source_ref: str | None = Field(None, max_length=2000)
    content: str | None = Field(None, max_length=500_000)
    lang: str = Field("en", min_length=2, max_length=5)


class KBDocumentCreate(KBDocumentBase):
    pass


class KBDocumentUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(None, min_length=1, max_length=500)
    source_ref: str | None = None
    content: str | None = Field(None, max_length=500_000)
    lang: str | None = Field(None, min_length=2, max_length=5)


class KBDocumentOut(KBDocumentBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    updated_at: datetime
    chunk_count: int = 0
