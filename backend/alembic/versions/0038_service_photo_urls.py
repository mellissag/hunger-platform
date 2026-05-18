"""service photo_urls gallery

Revision ID: 0038_service_photo_urls
Revises: 0037_promo_code_soft_delete
Create Date: 2026-05-15

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0038_service_photo_urls"
down_revision = "0037_promo_code_soft_delete"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "service",
        sa.Column("photo_urls", JSONB, nullable=False, server_default="[]"),
    )
    op.execute(
        sa.text(
            """
            UPDATE service
            SET photo_urls = jsonb_build_array(photo_url)
            WHERE photo_url IS NOT NULL
              AND trim(photo_url) <> ''
            """
        )
    )


def downgrade() -> None:
    op.drop_column("service", "photo_urls")
