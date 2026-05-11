"""chat metadata: chat / chat_tag / chat_tag_assignment

Revision ID: 0027_chat_metadata
Revises: 0026_daily_pick_button_fields
Create Date: 2026-05-11
"""

from __future__ import annotations

import uuid

import sqlalchemy as sa
from alembic import op

revision = "0027_chat_metadata"
down_revision = "0026_daily_pick_button_fields"
branch_labels = None
depends_on = None


DEFAULT_TAGS = [
    # (name, color)
    ("Ожидание", "#F59E0B"),
    ("Подтверждение", "#10B981"),
    ("Отказ", "#EF4444"),
    ("ВИП", "#C9A84C"),
    ("Думает", "#6B7280"),
]


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE chat (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            client_id UUID NOT NULL UNIQUE REFERENCES client(id) ON DELETE CASCADE,
            note TEXT,
            is_deleted BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )
    op.execute("CREATE INDEX ix_chat_client_id ON chat (client_id);")
    op.execute("CREATE INDEX ix_chat_is_deleted ON chat (is_deleted);")

    op.execute(
        """
        CREATE TABLE chat_tag (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(64) NOT NULL UNIQUE,
            color VARCHAR(7) NOT NULL,
            is_default BOOLEAN NOT NULL DEFAULT false,
            created_by UUID REFERENCES "user"(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )
    op.execute("CREATE INDEX ix_chat_tag_is_default ON chat_tag (is_default);")

    op.execute(
        """
        CREATE TABLE chat_tag_assignment (
            chat_id UUID NOT NULL REFERENCES chat(id) ON DELETE CASCADE,
            tag_id UUID NOT NULL REFERENCES chat_tag(id) ON DELETE CASCADE,
            assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (chat_id, tag_id)
        );
        """
    )
    op.execute("CREATE INDEX ix_chat_tag_assignment_tag_id ON chat_tag_assignment (tag_id);")

    # ── Seed default system tags ──────────────────────────────────────────────
    chat_tag_table = sa.table(
        "chat_tag",
        sa.column("id", sa.dialects.postgresql.UUID(as_uuid=True)),
        sa.column("name", sa.String(64)),
        sa.column("color", sa.String(7)),
        sa.column("is_default", sa.Boolean()),
    )
    op.bulk_insert(
        chat_tag_table,
        [
            {
                "id": uuid.uuid4(),
                "name": name,
                "color": color,
                "is_default": True,
            }
            for name, color in DEFAULT_TAGS
        ],
    )


def downgrade() -> None:
    op.drop_table("chat_tag_assignment")
    op.drop_table("chat_tag")
    op.drop_table("chat")
