"""user.permissions: JSON -> JSONB + backfill defaults.

Revision ID: 0031_user_permissions_jsonb
Revises: 0030_settings_role_permissions
Create Date: 2026-05-14

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0031_user_permissions_jsonb"
down_revision = "0030_settings_role_permissions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "user",
        "permissions",
        existing_type=sa.JSON(),
        type_=postgresql.JSONB(astext_type=sa.Text()),
        existing_nullable=True,
        postgresql_using="permissions::jsonb",
    )
    conn = op.get_bind()
    from app.core.user_page_permissions import backfill_null_permissions_sync

    backfill_null_permissions_sync(conn)


def downgrade() -> None:
    op.alter_column(
        "user",
        "permissions",
        existing_type=postgresql.JSONB(astext_type=sa.Text()),
        type_=sa.JSON(),
        existing_nullable=True,
        postgresql_using="permissions::json",
    )
