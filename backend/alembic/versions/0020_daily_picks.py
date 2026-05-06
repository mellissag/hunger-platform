"""add daily_picks table

Revision ID: 0020_daily_picks
Revises: 0019_phase37
Create Date: 2026-05-06

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "0020_daily_picks"
down_revision = "0019_phase37"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "daily_picks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "service_id",
            UUID(as_uuid=True),
            sa.ForeignKey("service.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("title_ru", sa.String(200), nullable=True),
        sa.Column("title_en", sa.String(200), nullable=True),
        sa.Column("title_uk", sa.String(200), nullable=True),
        sa.Column("title_bg", sa.String(200), nullable=True),
        sa.Column("tags_ru", sa.Text, nullable=True),
        sa.Column("tags_en", sa.Text, nullable=True),
        sa.Column("tags_uk", sa.Text, nullable=True),
        sa.Column("tags_bg", sa.Text, nullable=True),
        sa.Column("price", sa.Numeric(10, 2), nullable=True),
        sa.Column("active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("valid_from", sa.Date, nullable=True),
        sa.Column("valid_to", sa.Date, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("daily_picks")
