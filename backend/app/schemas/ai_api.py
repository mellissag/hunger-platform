"""Схемы REST для AI."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class TestChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question: str = Field(..., min_length=1, max_length=4000)
    lang: str = "en"


class TestChatResponse(BaseModel):
    answer: str
    cited_chunk_ids: list[UUID]


class TranslateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(..., min_length=1, max_length=12000)
    source_lang: str = Field(default="en", pattern="^(en|ru|uk|bg)$")
    """Язык вкладки, с которой взят текст (исходный)."""
    target_langs: list[str] | None = None
    """Если null — заполняются все четыре языка (черновики). Иначе только перечисленные коды."""


class TranslateResponse(BaseModel):
    en: str = ""
    ru: str = ""
    uk: str = ""
    bg: str = ""


class AIConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    client_id: UUID
    client_name: str | None
    started_at: datetime
    ended_at: datetime | None
    lang: str | None
    token_in: int
    token_out: int
    last_message_preview: str | None = None


class AIMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    role: str
    content: str
    created_at: datetime
    cited_chunks: list[UUID] | None
    flagged_negative: bool


class AIConversationDetailOut(AIConversationOut):
    messages: list[AIMessageOut]


class FlagMessageResponse(BaseModel):
    ok: bool = True
