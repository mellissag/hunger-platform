"""add_theme_to_client

Revision ID: 0023_add_theme_to_client
Revises: 0022_service_category_link
Create Date: 2026-05-09

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0023_add_theme_to_client"
down_revision = "0022_service_category_link"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "client",
        sa.Column("theme", sa.String(length=10), nullable=False, server_default="light"),
    )


def downgrade() -> None:
    op.drop_column("client", "theme")

