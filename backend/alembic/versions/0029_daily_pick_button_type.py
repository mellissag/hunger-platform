"""daily_picks: button_type url vs mini_app

Revision ID: 0029_daily_pick_button_type
Revises: 0028_broadcast_stats_deep
Create Date: 2026-05-13

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0029_daily_pick_button_type"
down_revision = "0028_broadcast_stats_deep"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "daily_picks",
        sa.Column(
            "button_type",
            sa.String(20),
            nullable=False,
            server_default="url",
        ),
    )


def downgrade() -> None:
    op.drop_column("daily_picks", "button_type")
