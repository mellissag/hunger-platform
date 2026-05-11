"""Chat metadata: per-client note, soft delete, color tags.

Notes
-----
A "chat" in the admin UI corresponds 1:1 to a Client (see ``chat_message`` table).
This module adds chat-level metadata that does not belong on ``client`` itself:

* :class:`Chat` — per-client chat note + soft-delete flag.
* :class:`ChatTag` — global tag dictionary (system defaults + user-created).
* :class:`ChatTagAssignment` — many-to-many between chats and tags.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.client import Client
    from app.models.user import User


class Chat(UUIDPrimaryKeyMixin, Base):
    """Chat metadata, lazily created when an admin attaches a tag, note, or soft-deletes."""

    __tablename__ = "chat"

    client_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("client.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_deleted: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    client: Mapped["Client"] = relationship("Client", foreign_keys=[client_id])
    tag_assignments: Mapped[list["ChatTagAssignment"]] = relationship(
        "ChatTagAssignment",
        back_populates="chat",
        cascade="all, delete-orphan",
    )


class ChatTag(UUIDPrimaryKeyMixin, Base):
    """A coloured label that can be attached to a chat."""

    __tablename__ = "chat_tag"

    name: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    # 7-char hex including the leading '#', e.g. "#C9A84C"
    color: Mapped[str] = mapped_column(String(7), nullable=False)
    is_default: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("user.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    creator: Mapped["User | None"] = relationship("User", foreign_keys=[created_by])
    assignments: Mapped[list["ChatTagAssignment"]] = relationship(
        "ChatTagAssignment",
        back_populates="tag",
        cascade="all, delete-orphan",
    )


class ChatTagAssignment(Base):
    """Many-to-many link between a chat and a tag."""

    __tablename__ = "chat_tag_assignment"

    chat_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("chat.id", ondelete="CASCADE"),
        primary_key=True,
    )
    tag_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("chat_tag.id", ondelete="CASCADE"),
        primary_key=True,
    )
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    chat: Mapped[Chat] = relationship("Chat", back_populates="tag_assignments")
    tag: Mapped[ChatTag] = relationship("ChatTag", back_populates="assignments")
