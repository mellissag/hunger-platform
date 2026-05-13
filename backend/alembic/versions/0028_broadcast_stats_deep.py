"""Broadcast deep stats: recipient engagement columns, booking.broadcast_id.

Revision ID: 0028_broadcast_stats_deep
Revises: 0027_chat_metadata
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0028_broadcast_stats_deep"
down_revision = "0027_chat_metadata"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("ALTER TYPE booking_created_via ADD VALUE IF NOT EXISTS 'broadcast'"))

    op.add_column(
        "broadcast_recipient",
        sa.Column("clicked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "broadcast_recipient",
        sa.Column("bot_opened_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "broadcast_recipient",
        sa.Column(
            "booking_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("booking.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "broadcast_recipient",
        sa.Column("error_type", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "broadcast_recipient",
        sa.Column("unsubscribed_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.add_column(
        "booking",
        sa.Column(
            "broadcast_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("broadcast.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    op.create_index(
        "ix_broadcast_recipient_broadcast_clicked",
        "broadcast_recipient",
        ["broadcast_id", "clicked_at"],
    )
    op.create_index(
        "ix_broadcast_recipient_broadcast_opened",
        "broadcast_recipient",
        ["broadcast_id", "bot_opened_at"],
    )
    op.create_index("ix_booking_broadcast_id", "booking", ["broadcast_id"])


def downgrade() -> None:
    op.drop_index("ix_booking_broadcast_id", table_name="booking")
    op.drop_index("ix_broadcast_recipient_broadcast_opened", table_name="broadcast_recipient")
    op.drop_index("ix_broadcast_recipient_broadcast_clicked", table_name="broadcast_recipient")
    op.drop_column("booking", "broadcast_id")
    op.drop_column("broadcast_recipient", "unsubscribed_at")
    op.drop_column("broadcast_recipient", "error_type")
    op.drop_column("broadcast_recipient", "booking_id")
    op.drop_column("broadcast_recipient", "bot_opened_at")
    op.drop_column("broadcast_recipient", "clicked_at")
