"""Instagram Messaging API message log (Meta)."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, Uuid, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin


class InstagramMsgDirection(str, enum.Enum):
    IN = "in"
    OUT = "out"


class InstagramMessage(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "instagram_messages"

    client_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("client.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    direction: Mapped[InstagramMsgDirection] = mapped_column(
        SAEnum(
            InstagramMsgDirection,
            name="instagrammsgdirection",
            native_enum=True,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
    )
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    ig_message_id: Mapped[str] = mapped_column(String(256), nullable=False, unique=True, index=True)
    instagram_user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    client: Mapped["app.models.client.Client | None"] = relationship(  # type: ignore[name-defined]
        "Client",
        foreign_keys=[client_id],
    )
