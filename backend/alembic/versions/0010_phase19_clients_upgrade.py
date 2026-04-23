"""Phase 19: client card — city, bot activity, funnel_stats, Telegram fields."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("client", sa.Column("city", sa.Text(), nullable=True))
    op.add_column(
        "client",
        sa.Column("joined_bot_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "client",
        sa.Column("last_bot_activity_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "client",
        sa.Column("total_bot_sessions", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "client",
        sa.Column("bot_blocked", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "client",
        sa.Column(
            "funnel_stats",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.alter_column("client", "total_bot_sessions", server_default=None)
    op.alter_column("client", "bot_blocked", server_default=None)
    op.alter_column("client", "funnel_stats", server_default=None)


def downgrade() -> None:
    op.drop_column("client", "funnel_stats")
    op.drop_column("client", "bot_blocked")
    op.drop_column("client", "total_bot_sessions")
    op.drop_column("client", "last_bot_activity_at")
    op.drop_column("client", "joined_bot_at")
    op.drop_column("client", "city")
