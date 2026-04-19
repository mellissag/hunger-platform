"""Флаги идемпотентности напоминаний по бронированию."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "booking",
        sa.Column("reminder_sent_24h", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "booking",
        sa.Column("reminder_sent_2h", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "booking",
        sa.Column("reminder_sent_30m", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column("booking", "reminder_sent_24h", server_default=None)
    op.alter_column("booking", "reminder_sent_2h", server_default=None)
    op.alter_column("booking", "reminder_sent_30m", server_default=None)


def downgrade() -> None:
    op.drop_column("booking", "reminder_sent_30m")
    op.drop_column("booking", "reminder_sent_2h")
    op.drop_column("booking", "reminder_sent_24h")
