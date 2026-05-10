"""add permissions JSON column to user table"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0025_add_permissions_json_to_users"
down_revision = "0024_booking_client_comment_flags"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user",
        sa.Column("permissions", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("user", "permissions")
