"""Instagram messaging: client.instagram_user_id, instagram_messages, enums.

Revision ID: 0039_instagram_messaging
Revises: 0038_service_photo_urls
Create Date: 2026-05-22

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0039_instagram_messaging"
down_revision = "0038_service_photo_urls"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE chatchannel ADD VALUE IF NOT EXISTS 'instagram'")
    op.execute("ALTER TYPE booking_created_via ADD VALUE IF NOT EXISTS 'instagram'")

    op.add_column("client", sa.Column("instagram_user_id", sa.String(length=64), nullable=True))
    op.create_index(
        "ix_client_instagram_user_id",
        "client",
        ["instagram_user_id"],
        unique=True,
        postgresql_where=sa.text("instagram_user_id IS NOT NULL"),
    )

    op.execute(
        """
        CREATE TYPE instagrammsgdirection AS ENUM ('in', 'out');
        """
    )
    op.create_table(
        "instagram_messages",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("client_id", sa.Uuid(), nullable=True),
        sa.Column(
            "direction",
            postgresql.ENUM("in", "out", name="instagrammsgdirection", create_type=False),
            nullable=False,
        ),
        sa.Column("text", sa.Text(), nullable=True),
        sa.Column("ig_message_id", sa.String(length=256), nullable=False),
        sa.Column("instagram_user_id", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["client_id"], ["client.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("ig_message_id", name="uq_instagram_messages_ig_message_id"),
    )
    op.create_index("ix_instagram_messages_client_id", "instagram_messages", ["client_id"])
    op.create_index("ix_instagram_messages_ig_user", "instagram_messages", ["instagram_user_id"])


def downgrade() -> None:
    op.drop_index("ix_instagram_messages_ig_user", table_name="instagram_messages")
    op.drop_index("ix_instagram_messages_client_id", table_name="instagram_messages")
    op.drop_table("instagram_messages")
    op.execute("DROP TYPE IF EXISTS instagrammsgdirection")
    op.drop_index("ix_client_instagram_user_id", table_name="client")
    op.drop_column("client", "instagram_user_id")
