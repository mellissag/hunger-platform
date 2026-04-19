"""Initial schema: все таблицы Phase 1 + ivfflat на kb_chunk.embedding."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("CREATE EXTENSION IF NOT EXISTS vector"))
    op.execute(sa.text("CREATE EXTENSION IF NOT EXISTS citext"))

    import app.models  # noqa: F401
    import pgvector.sqlalchemy  # noqa: F401 — регистрация Vector

    from app.db.base import Base

    bind = op.get_bind()
    Base.metadata.create_all(bind=bind, checkfirst=True)

    op.execute(
        sa.text(
            """
            CREATE INDEX IF NOT EXISTS ix_kb_chunk_embedding_ivfflat
            ON kb_chunk
            USING ivfflat (embedding vector_cosine_ops)
            WITH (lists = 100);
            """
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS ix_kb_chunk_embedding_ivfflat"))

    import app.models  # noqa: F401

    from app.db.base import Base

    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind, checkfirst=True)

    for enum_name in (
        "ai_message_role",
        "booking_created_via",
        "client_source",
        "kb_source_type",
        "broadcast_recipient_status",
        "broadcast_status",
        "prepayment_status",
        "booking_status",
        "slot_type",
        "late_cancellation_policy",
        "theme_preset",
        "user_role",
    ):
        op.execute(sa.text(f"DROP TYPE IF EXISTS {enum_name} CASCADE"))

    op.execute(sa.text("DROP EXTENSION IF EXISTS vector CASCADE"))
    op.execute(sa.text("DROP EXTENSION IF EXISTS citext CASCADE"))
