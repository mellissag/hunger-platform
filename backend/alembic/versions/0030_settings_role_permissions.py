"""settings: role_permissions JSONB (admin clients, reception pages).

Revision ID: 0030_settings_role_permissions
Revises: 0029_daily_pick_button_type
Create Date: 2026-05-13

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0030_settings_role_permissions"
down_revision = "0029_daily_pick_button_type"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "settings",
        sa.Column(
            "role_permissions",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("settings", "role_permissions")
