"""Phase 12: финальные страницы — расширение настроек салона, инвайты."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("salon", sa.Column("favicon_url", sa.Text(), nullable=True))
    op.add_column(
        "salon",
        sa.Column(
            "contacts",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )

    op.add_column(
        "settings",
        sa.Column("ai_temperature", sa.REAL(), nullable=False, server_default=sa.text("0.7")),
    )
    op.add_column(
        "settings",
        sa.Column(
            "ai_few_shot_examples",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column(
        "settings",
        sa.Column(
            "integrations",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.add_column(
        "settings",
        sa.Column(
            "reminder_message_templates",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.add_column("settings", sa.Column("prepayment_min_amount", sa.Numeric(10, 2), nullable=True))
    op.add_column(
        "settings",
        sa.Column(
            "prepayment_skip_min_visits",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.add_column(
        "settings",
        sa.Column("date_format", sa.Text(), nullable=False, server_default=sa.text("'yyyy-MM-dd'")),
    )
    op.add_column(
        "settings",
        sa.Column("time_format", sa.Text(), nullable=False, server_default=sa.text("'HH:mm'")),
    )

    op.create_table(
        "user_invite",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", postgresql.CITEXT(), nullable=False),
        sa.Column("role", postgresql.ENUM("owner", "admin", "master", "reception", name="user_role", create_type=False), nullable=False),
        sa.Column("first_name", sa.Text(), nullable=False),
        sa.Column("last_name", sa.Text(), nullable=True),
        sa.Column("token_hash", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_user_id", sa.Uuid(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_user_invite_token_hash", "user_invite", ["token_hash"], unique=False)
    op.create_index("ix_user_invite_email_pending", "user_invite", ["email"], unique=True, postgresql_where=sa.text("used_at IS NULL"))


def downgrade() -> None:
    op.drop_index("ix_user_invite_email_pending", table_name="user_invite")
    op.drop_index("ix_user_invite_token_hash", table_name="user_invite")
    op.drop_table("user_invite")

    op.drop_column("settings", "time_format")
    op.drop_column("settings", "date_format")
    op.drop_column("settings", "prepayment_skip_min_visits")
    op.drop_column("settings", "prepayment_min_amount")
    op.drop_column("settings", "reminder_message_templates")
    op.drop_column("settings", "integrations")
    op.drop_column("settings", "ai_few_shot_examples")
    op.drop_column("settings", "ai_temperature")

    op.drop_column("salon", "contacts")
    op.drop_column("salon", "favicon_url")
