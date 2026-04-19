"""База знаний и чанки для RAG."""

from __future__ import annotations

import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, ForeignKey, Integer, Text, Uuid, func
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import KBSourceType
from app.models.mixins import UUIDPrimaryKeyMixin


class KBDocument(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "kb_document"

    title: Mapped[str] = mapped_column(Text, nullable=False)
    source_type: Mapped[KBSourceType] = mapped_column(
        SQLEnum(
            KBSourceType,
            name="kb_source_type",
            native_enum=True,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
        default=KBSourceType.manual,
    )
    source_ref: Mapped[str | None] = mapped_column(Text, nullable=True)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    lang: Mapped[str] = mapped_column(Text, nullable=False, default="en")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    chunks: Mapped[list["KBChunk"]] = relationship(
        "KBChunk",
        back_populates="document",
        cascade="all, delete-orphan",
    )


class KBChunk(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "kb_chunk"

    document_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("kb_document.id", ondelete="CASCADE"),
        nullable=False,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float]] = mapped_column(Vector(768), nullable=False)
    token_count: Mapped[int] = mapped_column(Integer, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    document: Mapped[KBDocument] = relationship("KBDocument", back_populates="chunks")
