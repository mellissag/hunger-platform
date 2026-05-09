"""service_category_link m2m

Revision ID: 0022_service_category_link
Revises: 0021_add_chat_message
Create Date: 2026-05-09

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0022_service_category_link"
down_revision = "0021_add_chat_message"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "service_category_link",
        sa.Column("service_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("category_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(["service_id"], ["service.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["category_id"], ["service_category.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("service_id", "category_id"),
    )
    op.create_index(
        "ix_service_category_link_category_id",
        "service_category_link",
        ["category_id"],
        unique=False,
    )
    op.execute(
        """
        INSERT INTO service_category_link (service_id, category_id)
        SELECT id, category_id FROM service WHERE category_id IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_index("ix_service_category_link_category_id", table_name="service_category_link")
    op.drop_table("service_category_link")
