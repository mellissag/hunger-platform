"""Simplify themes: only premium_light and premium_dark (Phase 18)."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    op.execute(sa.text("ALTER TYPE theme_preset ADD VALUE IF NOT EXISTS 'premium_dark'"))
    op.execute(
        sa.text(
            """
            UPDATE settings
            SET theme = 'premium_light'
            WHERE theme::text IN ('minimal', 'friendly', 'premium')
            """
        )
    )


def downgrade() -> None:
    # Enum values cannot be removed safely; data may reference premium_dark.
    pass
