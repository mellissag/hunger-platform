"""WhatsApp messages table, client.whatsapp_phone, chat_message.channel.

Revision ID: 0032_whatsapp_messages_and_chat_channel
Revises: 0031_user_permissions_jsonb
Create Date: 2026-05-14

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0032_whatsapp_messages_and_chat_channel"
down_revision = "0031_user_permissions_jsonb"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TYPE chatchannel AS ENUM ('telegram', 'whatsapp');
        """
    )
    op.add_column(
        "chat_message",
        sa.Column(
            "channel",
            postgresql.ENUM("telegram", "whatsapp", name="chatchannel", create_type=False),
            nullable=False,
            server_default="telegram",
        ),
    )
    op.execute("ALTER TABLE chat_message ALTER COLUMN channel DROP DEFAULT")

    op.add_column("client", sa.Column("whatsapp_phone", sa.Text(), nullable=True))

    op.execute(
        """
        CREATE TYPE whatsappmsgdirection AS ENUM ('in', 'out');
        """
    )
    op.execute(
        """
        CREATE TYPE whatsappmsgstatus AS ENUM ('sent', 'delivered', 'read', 'failed');
        """
    )
    op.create_table(
        "whatsapp_messages",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("client_id", sa.Uuid(), nullable=True),
        sa.Column(
            "direction",
            postgresql.ENUM("in", "out", name="whatsappmsgdirection", create_type=False),
            nullable=False,
        ),
        sa.Column("text", sa.Text(), nullable=True),
        sa.Column("wa_message_id", sa.String(length=128), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM(
                "sent",
                "delivered",
                "read",
                "failed",
                name="whatsappmsgstatus",
                create_type=False,
            ),
            nullable=True,
        ),
        sa.Column("phone_number", sa.String(length=32), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["client_id"], ["client.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("wa_message_id", name="uq_whatsapp_messages_wa_message_id"),
    )
    op.create_index("ix_whatsapp_messages_client_id", "whatsapp_messages", ["client_id"])
    op.create_index("ix_whatsapp_messages_phone_number", "whatsapp_messages", ["phone_number"])


def downgrade() -> None:
    op.drop_index("ix_whatsapp_messages_phone_number", table_name="whatsapp_messages")
    op.drop_index("ix_whatsapp_messages_client_id", table_name="whatsapp_messages")
    op.drop_table("whatsapp_messages")
    op.execute("DROP TYPE whatsappmsgstatus")
    op.execute("DROP TYPE whatsappmsgdirection")
    op.drop_column("client", "whatsapp_phone")
    op.drop_column("chat_message", "channel")
    op.execute("DROP TYPE chatchannel")
