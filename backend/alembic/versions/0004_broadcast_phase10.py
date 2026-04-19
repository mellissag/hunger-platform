"""Phase 10: рассылки — marketing opt-out, inline keyboard, media type."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "client",
        sa.Column(
            "marketing_opted_out",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "broadcast",
        sa.Column("inline_keyboard", JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column("broadcast", sa.Column("media_type", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("broadcast", "media_type")
    op.drop_column("broadcast", "inline_keyboard")
    op.drop_column("client", "marketing_opted_out")
