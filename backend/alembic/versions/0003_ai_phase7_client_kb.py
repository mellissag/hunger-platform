"""AI фаза 7: prefers_no_ai, cited_chunks как uuid[], flagged_negative."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY, UUID

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "client",
        sa.Column("prefers_no_ai", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column("client", "prefers_no_ai", server_default=None)

    op.add_column(
        "ai_message",
        sa.Column("flagged_negative", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column("ai_message", "flagged_negative", server_default=None)

    op.drop_column("ai_message", "cited_chunks")
    op.add_column(
        "ai_message",
        sa.Column("cited_chunks", ARRAY(UUID(as_uuid=True)), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("ai_message", "cited_chunks")
    op.add_column(
        "ai_message",
        sa.Column("cited_chunks", ARRAY(sa.Integer()), nullable=True),
    )
    op.drop_column("ai_message", "flagged_negative")
    op.drop_column("client", "prefers_no_ai")
