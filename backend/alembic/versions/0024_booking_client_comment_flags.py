"""booking: client_comment, any_master, call_for_time"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0024_booking_client_comment_flags"
down_revision = "0023_add_theme_to_client"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "booking",
        sa.Column("client_comment", sa.Text(), nullable=True),
    )
    op.add_column(
        "booking",
        sa.Column("any_master", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "booking",
        sa.Column("call_for_time", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.alter_column("booking", "any_master", server_default=None)
    op.alter_column("booking", "call_for_time", server_default=None)


def downgrade() -> None:
    op.drop_column("booking", "call_for_time")
    op.drop_column("booking", "any_master")
    op.drop_column("booking", "client_comment")
