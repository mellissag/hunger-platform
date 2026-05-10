"""add button_text and button_url to daily_picks

Revision ID: 0026_daily_pick_button_fields
Revises: 0025_add_permissions_json_to_users
Create Date: 2026-05-11

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0026_daily_pick_button_fields"
down_revision = "0025_add_permissions_json_to_users"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("daily_picks", sa.Column("button_text_ru", sa.String(200), nullable=True))
    op.add_column("daily_picks", sa.Column("button_text_en", sa.String(200), nullable=True))
    op.add_column("daily_picks", sa.Column("button_text_uk", sa.String(200), nullable=True))
    op.add_column("daily_picks", sa.Column("button_text_bg", sa.String(200), nullable=True))
    op.add_column("daily_picks", sa.Column("button_url", sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column("daily_picks", "button_url")
    op.drop_column("daily_picks", "button_text_bg")
    op.drop_column("daily_picks", "button_text_uk")
    op.drop_column("daily_picks", "button_text_en")
    op.drop_column("daily_picks", "button_text_ru")
