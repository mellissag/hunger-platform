"""booking_created_via: add ai_chat.

Revision ID: 0040_booking_created_via_ai_chat
Revises: 0039_instagram_messaging
"""

from alembic import op

revision = "0040_booking_created_via_ai_chat"
down_revision = "0039_instagram_messaging"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE booking_created_via ADD VALUE IF NOT EXISTS 'ai_chat'")


def downgrade() -> None:
    pass
