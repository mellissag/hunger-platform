"""Phase 13: Mini App — admin_notify_chat_id, review worker fields."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"


def upgrade() -> None:
    # Settings: admin notify + mini-app toggle
    op.add_column("settings", sa.Column("admin_notify_chat_id", sa.Text(), nullable=True))
    op.add_column("settings", sa.Column("mini_app_enabled", sa.Boolean(), nullable=False, server_default="true"))

    # Booking: review_sent flag for idempotent worker
    op.add_column("booking", sa.Column("review_sent", sa.Boolean(), nullable=False, server_default="false"))

    # BookingCreatedVia: add mini_app value
    op.execute("ALTER TYPE booking_created_via ADD VALUE IF NOT EXISTS 'mini_app'")

    # Review: index for master rating aggregation
    op.create_index("ix_review_master_id", "review", ["master_id"])


def downgrade() -> None:
    op.drop_index("ix_review_master_id", table_name="review")
    op.drop_column("booking", "review_sent")
    op.drop_column("settings", "mini_app_enabled")
    op.drop_column("settings", "admin_notify_chat_id")
