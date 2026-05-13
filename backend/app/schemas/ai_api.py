"""Схемы REST для AI."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class TestChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question: str = Field(..., min_length=1, max_length=4000)
    lang: str = "en"


class TestChatResponse(BaseModel):
    answer: str
    cited_chunk_ids: list[UUID]


class TranslateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_lang: str = Field(default="en", pattern="^(en|ru|uk|bg)$")
    """Язык вкладки-источника."""
    target_langs: list[str] | None = None
    """Если null — все четыре языка. Иначе только перечисленные коды."""
    content_type: Literal["plain", "collection"] | None = None
    # ── plain mode
    text: str | None = Field(default=None, max_length=12000)
    # ── collection mode (Mini App daily pick)
    title: str | None = None
    tags: str | None = None
    button_text: str | None = None

    @model_validator(mode="after")
    def _validate_mode(self) -> "TranslateRequest":
        ct = (self.content_type or "plain").lower()
        if ct == "collection":
            if not any(
                [
                    (self.title or "").strip(),
                    (self.tags or "").strip(),
                    (self.button_text or "").strip(),
                ],
            ):
                raise ValueError("collection: at least one of title, tags, button_text must be non-empty")
        else:
            if not (self.text or "").strip():
                raise ValueError("plain: text is required")
        return self


class TranslateCollectionLocale(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = ""
    tags: str = ""
    button_text: str = ""


class TranslateResponse(BaseModel):
    en: str = ""
    ru: str = ""
    uk: str = ""
    bg: str = ""
    collection: dict[str, TranslateCollectionLocale] | None = None


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
