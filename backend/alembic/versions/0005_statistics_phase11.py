"""Phase 11: статистика — payroll у мастера, индексы для агрегаций."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "master",
        sa.Column(
            "payroll_percent",
            sa.Numeric(5, 2),
            nullable=False,
            server_default=sa.text("40.00"),
        ),
    )
    op.create_index("ix_booking_created_at", "booking", ["created_at"], unique=False)
    op.create_index(
        "ix_ai_conversation_started_at",
        "ai_conversation",
        ["started_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_ai_conversation_started_at", table_name="ai_conversation")
    op.drop_index("ix_booking_created_at", table_name="booking")
    op.drop_column("master", "payroll_percent")
