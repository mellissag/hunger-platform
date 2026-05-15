"""loyalty system: points, promo codes, referrals, client statuses

Revision ID: 0035_loyalty_system
Revises: 0034_daily_pick_datetime
Create Date: 2026-05-15

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0035_loyalty_system"
down_revision = "0034_daily_pick_datetime"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE TYPE promo_discount_type AS ENUM ('percent', 'fixed')")
    op.execute("CREATE TYPE referral_reward_mode AS ENUM ('both', 'referrer_only', 'invited_only')")
    op.execute("CREATE TYPE referral_trigger AS ENUM ('on_registration', 'on_first_visit')")
    op.execute(
        "CREATE TYPE loyalty_transaction_type AS ENUM "
        "('earned', 'spent', 'referral_bonus', 'manual_adjustment')"
    )

    op.create_table(
        "client_status",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name_ru", sa.Text(), nullable=False),
        sa.Column("name_en", sa.Text(), nullable=False),
        sa.Column("name_bg", sa.Text(), nullable=False),
        sa.Column("name_uk", sa.Text(), nullable=False),
        sa.Column("background_color", sa.String(7), nullable=False, server_default="#C9A84C"),
        sa.Column("text_color", sa.String(7), nullable=False, server_default="#FFFFFF"),
        sa.Column("discount_percent", sa.Integer(), nullable=True),
        sa.Column("points_multiplier", sa.Numeric(4, 2), nullable=False, server_default="1.0"),
        sa.Column("min_visits", sa.Integer(), nullable=True),
        sa.Column("min_spent", sa.Numeric(12, 2), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "loyalty_settings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("referral_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "referral_reward_mode",
            postgresql.ENUM(
                "both",
                "referrer_only",
                "invited_only",
                name="referral_reward_mode",
                create_type=False,
            ),
            nullable=False,
            server_default="both",
        ),
        sa.Column(
            "referral_trigger",
            postgresql.ENUM(
                "on_registration",
                "on_first_visit",
                name="referral_trigger",
                create_type=False,
            ),
            nullable=False,
            server_default="on_first_visit",
        ),
        sa.Column("referral_bonus_referrer", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("referral_bonus_invited", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("points_value_eur", sa.Numeric(10, 4), nullable=False, server_default="0.01"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "promo_code",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(32), nullable=False),
        sa.Column(
            "discount_type",
            postgresql.ENUM("percent", "fixed", name="promo_discount_type", create_type=False),
            nullable=False,
        ),
        sa.Column("discount_value", sa.Numeric(10, 2), nullable=False),
        sa.Column("min_booking_amount", sa.Numeric(10, 2), nullable=True),
        sa.Column("max_uses", sa.Integer(), nullable=True),
        sa.Column("uses_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_uses_per_client", sa.Integer(), nullable=True, server_default="1"),
        sa.Column("valid_from", sa.Date(), nullable=True),
        sa.Column("valid_until", sa.Date(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )

    op.create_table(
        "referral_code",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("client_id", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(8), nullable=False),
        sa.Column("uses_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["client_id"], ["client.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("client_id"),
        sa.UniqueConstraint("code"),
    )

    op.add_column(
        "service",
        sa.Column("loyalty_points", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("client", sa.Column("loyalty_points", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("client", sa.Column("status_id", sa.Uuid(), nullable=True))
    op.add_column(
        "client",
        sa.Column("status_assigned_manually", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column("client", sa.Column("total_visits", sa.Integer(), nullable=False, server_default="0"))
    op.add_column(
        "client",
        sa.Column("total_spent", sa.Numeric(12, 2), nullable=False, server_default="0"),
    )
    op.add_column("client", sa.Column("referred_by_client_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_client_status_id",
        "client",
        "client_status",
        ["status_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_client_referred_by",
        "client",
        "client",
        ["referred_by_client_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.add_column("booking", sa.Column("promo_code_id", sa.Uuid(), nullable=True))
    op.add_column("booking", sa.Column("promo_discount_amount", sa.Numeric(10, 2), nullable=True))
    op.add_column("booking", sa.Column("points_spent", sa.Integer(), nullable=False, server_default="0"))
    op.add_column(
        "booking",
        sa.Column("points_spent_discount", sa.Numeric(10, 2), nullable=False, server_default="0"),
    )
    op.add_column("booking", sa.Column("points_earned", sa.Integer(), nullable=False, server_default="0"))
    op.create_foreign_key(
        "fk_booking_promo_code",
        "booking",
        "promo_code",
        ["promo_code_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_table(
        "loyalty_transaction",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("client_id", sa.Uuid(), nullable=False),
        sa.Column("booking_id", sa.Uuid(), nullable=True),
        sa.Column(
            "type",
            postgresql.ENUM(
                "earned",
                "spent",
                "referral_bonus",
                "manual_adjustment",
                name="loyalty_transaction_type",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("points", sa.Integer(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["booking_id"], ["booking.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["client_id"], ["client.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_loyalty_transaction_client_id", "loyalty_transaction", ["client_id"])
    op.create_index("ix_loyalty_transaction_created_at", "loyalty_transaction", ["created_at"])

    op.execute(
        """
        INSERT INTO loyalty_settings (id, referral_enabled, referral_reward_mode, referral_trigger,
            referral_bonus_referrer, referral_bonus_invited, points_value_eur)
        VALUES (gen_random_uuid(), true, 'both', 'on_first_visit', 50, 100, 0.01)
        """
    )


def downgrade() -> None:
    op.drop_index("ix_loyalty_transaction_created_at", table_name="loyalty_transaction")
    op.drop_index("ix_loyalty_transaction_client_id", table_name="loyalty_transaction")
    op.drop_table("loyalty_transaction")
    op.drop_constraint("fk_booking_promo_code", "booking", type_="foreignkey")
    op.drop_column("booking", "points_earned")
    op.drop_column("booking", "points_spent_discount")
    op.drop_column("booking", "points_spent")
    op.drop_column("booking", "promo_discount_amount")
    op.drop_column("booking", "promo_code_id")
    op.drop_constraint("fk_client_referred_by", "client", type_="foreignkey")
    op.drop_constraint("fk_client_status_id", "client", type_="foreignkey")
    op.drop_column("client", "referred_by_client_id")
    op.drop_column("client", "total_spent")
    op.drop_column("client", "total_visits")
    op.drop_column("client", "status_assigned_manually")
    op.drop_column("client", "status_id")
    op.drop_column("client", "loyalty_points")
    op.drop_column("service", "loyalty_points")
    op.drop_table("referral_code")
    op.drop_table("promo_code")
    op.drop_table("loyalty_settings")
    op.drop_table("client_status")
    op.execute("DROP TYPE IF EXISTS loyalty_transaction_type")
    op.execute("DROP TYPE IF EXISTS referral_trigger")
    op.execute("DROP TYPE IF EXISTS referral_reward_mode")
    op.execute("DROP TYPE IF EXISTS promo_discount_type")
