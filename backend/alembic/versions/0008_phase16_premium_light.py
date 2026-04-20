"""Phase 16: Premium Light theme — add premium_light to theme_preset enum."""

from __future__ import annotations

from alembic import op

revision = "0008"
down_revision = "0007"


def upgrade() -> None:
    op.execute("ALTER TYPE theme_preset ADD VALUE IF NOT EXISTS 'premium_light'")


def downgrade() -> None:
    # PostgreSQL does not support removing enum values without recreating the type.
    # Downgrade is intentionally a no-op for enum value additions.
    pass
