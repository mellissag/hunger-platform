"""add_chat_message

Revision ID: 0021_add_chat_message
Revises: 0020_daily_picks
Create Date: 2026-05-08

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0021_add_chat_message"
down_revision = "0020_daily_picks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TYPE messagedirection AS ENUM ('inbound', 'outbound');
    """)
    op.execute("""
        CREATE TYPE messagetype AS ENUM ('text', 'photo', 'video', 'voice', 'document', 'sticker');
    """)
    op.execute("""
        CREATE TABLE chat_message (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            client_id UUID NOT NULL REFERENCES client(id) ON DELETE CASCADE,
            direction messagedirection NOT NULL,
            message_type messagetype NOT NULL DEFAULT 'text',
            text TEXT,
            tg_file_id VARCHAR(256),
            media_path VARCHAR(512),
            tg_message_id INTEGER,
            is_read BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    """)
    op.execute("CREATE INDEX ix_chat_message_client_id ON chat_message (client_id);")
    op.execute("CREATE INDEX ix_chat_message_created_at ON chat_message (created_at);")


def downgrade() -> None:
    op.drop_table("chat_message")
    op.execute("DROP TYPE IF EXISTS messagedirection")
    op.execute("DROP TYPE IF EXISTS messagetype")
