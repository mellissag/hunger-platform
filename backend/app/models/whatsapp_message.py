"""WhatsApp Cloud API message log (Meta)."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, Uuid, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin


class WhatsAppMsgDirection(str, enum.Enum):
    """Meta direction: business perspective in spec (in = from user)."""

    IN = "in"
    OUT = "out"


class WhatsAppMsgStatus(str, enum.Enum):
    sent = "sent"
    delivered = "delivered"
    read = "read"
    failed = "failed"


class WhatsAppMessage(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "whatsapp_messages"

    client_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("client.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    direction: Mapped[WhatsAppMsgDirection] = mapped_column(
        SAEnum(
            WhatsAppMsgDirection,
            name="whatsappmsgdirection",
            native_enum=True,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
    )
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    wa_message_id: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    status: Mapped[WhatsAppMsgStatus | None] = mapped_column(
        SAEnum(
            WhatsAppMsgStatus,
            name="whatsappmsgstatus",
            native_enum=True,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=True,
    )
    phone_number: Mapped[str] = mapped_column(String(32), nullable=False, index=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    client: Mapped["app.models.client.Client | None"] = relationship(  # type: ignore[name-defined]
        "Client",
        foreign_keys=[client_id],
    )
