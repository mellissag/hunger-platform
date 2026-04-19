"""AI-диалоги в боте."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Text, Uuid, func
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import AIMessageRole
from app.models.mixins import UUIDPrimaryKeyMixin


class AIConversation(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "ai_conversation"

    client_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("client.id", ondelete="CASCADE"),
        nullable=False,
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    lang: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_in: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    token_out: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    messages: Mapped[list["AIMessage"]] = relationship(
        "AIMessage",
        back_populates="conversation",
        cascade="all, delete-orphan",
    )


class AIMessage(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "ai_message"

    conversation_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("ai_conversation.id", ondelete="CASCADE"),
        nullable=False,
    )
    role: Mapped[AIMessageRole] = mapped_column(
        SQLEnum(
            AIMessageRole,
            name="ai_message_role",
            native_enum=True,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    cited_chunks: Mapped[list[uuid.UUID] | None] = mapped_column(
        ARRAY(Uuid(as_uuid=True)), nullable=True
    )
    flagged_negative: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    conversation: Mapped[AIConversation] = relationship("AIConversation", back_populates="messages")
