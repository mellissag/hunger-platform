"""promo_code soft delete (deleted_at)

Revision ID: 0037_promo_code_soft_delete
Revises: 0036_seed_default_client_statuses
Create Date: 2026-05-15

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0037_promo_code_soft_delete"
down_revision = "0036_seed_default_client_statuses"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE promo_code ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_promo_code_deleted_at ON promo_code (deleted_at)"
    )


def downgrade() -> None:
    op.drop_index("ix_promo_code_deleted_at", table_name="promo_code")
    op.drop_column("promo_code", "deleted_at")
