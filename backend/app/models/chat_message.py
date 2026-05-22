"""Chat messages between clients (via Telegram) and admins."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text, Uuid, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin


class MessageDirection(str, enum.Enum):
    inbound = "inbound"    # from client
    outbound = "outbound"  # from admin


class MessageType(str, enum.Enum):
    text = "text"
    photo = "photo"
    video = "video"
    voice = "voice"
    document = "document"
    sticker = "sticker"


class ChatChannel(str, enum.Enum):
    telegram = "telegram"
    whatsapp = "whatsapp"
    instagram = "instagram"


class ChatMessage(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "chat_message"

    client_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("client.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    direction: Mapped[MessageDirection] = mapped_column(
        SAEnum(MessageDirection, name="messagedirection", native_enum=True, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    message_type: Mapped[MessageType] = mapped_column(
        SAEnum(MessageType, name="messagetype", native_enum=True, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=MessageType.text,
    )
    channel: Mapped[ChatChannel] = mapped_column(
        SAEnum(
            ChatChannel,
            name="chatchannel",
            native_enum=True,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
        default=ChatChannel.telegram,
        server_default="telegram",
    )

    # Text content (or caption for media)
    text: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Telegram file_id for re-downloading
    tg_file_id: Mapped[str | None] = mapped_column(String(256), nullable=True)

    # Local path relative to UPLOAD_DIR (e.g. "chat/abc.jpg")
    media_path: Mapped[str | None] = mapped_column(String(512), nullable=True)

    # Telegram message_id for reply/edit
    tg_message_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    client: Mapped["app.models.client.Client"] = relationship(  # type: ignore[name-defined]
        "Client",
        back_populates="chat_messages",
    )
