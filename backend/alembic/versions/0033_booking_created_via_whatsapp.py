"""booking_created_via: add whatsapp.

Revision ID: 0033_booking_created_via_whatsapp
Revises: 0032_whatsapp_messages_and_chat_channel
Create Date: 2026-05-14

"""

from __future__ import annotations

from alembic import op

revision = "0033_booking_created_via_whatsapp"
down_revision = "0032_whatsapp_messages_and_chat_channel"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE booking_created_via ADD VALUE IF NOT EXISTS 'whatsapp'")


def downgrade() -> None:
    pass
