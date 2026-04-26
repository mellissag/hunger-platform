"""Ensure client.funnel_stats has a PostgreSQL default (matches ORM server_default)."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "client",
        "funnel_stats",
        server_default=sa.text("'{}'::jsonb"),
        existing_type=JSONB(astext_type=sa.Text()),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "client",
        "funnel_stats",
        server_default=None,
        existing_type=JSONB(astext_type=sa.Text()),
        existing_nullable=False,
    )
