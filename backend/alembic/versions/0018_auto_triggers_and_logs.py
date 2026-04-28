"""Add auto trigger tables and trigger logs."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "auto_trigger",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("delay_hours", sa.Integer(), nullable=False, server_default=sa.text("3")),
        sa.Column("template_text", sa.Text(), nullable=False),
        sa.Column("photo_url", sa.Text(), nullable=True),
        sa.Column("buttons", JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("master_id", UUID(as_uuid=True), sa.ForeignKey("master.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_auto_trigger_type_active", "auto_trigger", ["type", "is_active"])

    op.create_table(
        "trigger_log",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("trigger_id", UUID(as_uuid=True), sa.ForeignKey("auto_trigger.id", ondelete="SET NULL")),
        sa.Column("client_id", UUID(as_uuid=True), sa.ForeignKey("client.id", ondelete="CASCADE"), nullable=False),
        sa.Column("booking_id", UUID(as_uuid=True), sa.ForeignKey("booking.id", ondelete="SET NULL")),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("error_reason", sa.Text(), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_trigger_log_client_booking", "trigger_log", ["client_id", "booking_id"])


def downgrade() -> None:
    op.drop_index("ix_trigger_log_client_booking", table_name="trigger_log")
    op.drop_table("trigger_log")
    op.drop_index("ix_auto_trigger_type_active", table_name="auto_trigger")
    op.drop_table("auto_trigger")
