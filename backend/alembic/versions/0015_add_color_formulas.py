"""Add color_formula table."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "color_formula",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "client_id",
            UUID(as_uuid=True),
            sa.ForeignKey("client.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "master_id",
            UUID(as_uuid=True),
            sa.ForeignKey("master.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "booking_id",
            UUID(as_uuid=True),
            sa.ForeignKey("booking.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("technique", sa.String(100), nullable=True),
        sa.Column("brand", sa.String(100), nullable=True),
        sa.Column("base_color", sa.String(100), nullable=True),
        sa.Column("base_amount_ml", sa.Numeric(6, 1), nullable=True),
        sa.Column("mixer_color", sa.String(100), nullable=True),
        sa.Column("mixer_amount_ml", sa.Numeric(6, 1), nullable=True),
        sa.Column("developer_percent", sa.String(10), nullable=True),
        sa.Column("developer_ml", sa.Numeric(6, 1), nullable=True),
        sa.Column("processing_time_min", sa.Integer(), nullable=True),
        sa.Column("result_description", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("photo_url", sa.String(500), nullable=True),
    )

    op.create_index("ix_color_formula_client_id", "color_formula", ["client_id"])


def downgrade() -> None:
    op.drop_index("ix_color_formula_client_id", "color_formula")
    op.drop_table("color_formula")
