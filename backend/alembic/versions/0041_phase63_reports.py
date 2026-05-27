"""Phase 63: reports — expenses, salary, booking payment, reports_access.

Revision ID: 0041_phase63_reports
Revises: 0040_booking_created_via_ai_chat
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ENUM, UUID

revision = "0041_phase63_reports"
down_revision = "0040_booking_created_via_ai_chat"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE payment_method AS ENUM ('unpaid', 'cash', 'card', 'mixed');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
        """
    )
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE expense_category AS ENUM (
                'rent', 'utilities', 'supplies', 'advertising', 'equipment',
                'taxes', 'software', 'training', 'salary_bonus', 'other'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
        """
    )
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE salary_type AS ENUM ('percent', 'fixed', 'mixed');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
        """
    )
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE salary_payment_status AS ENUM ('calculated', 'paid');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
        """
    )

    payment_method_enum = ENUM(
        "unpaid", "cash", "card", "mixed", name="payment_method", create_type=False
    )
    payment_method_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "booking",
        sa.Column(
            "payment_method",
            payment_method_enum,
            nullable=False,
            server_default="unpaid",
        ),
    )
    op.add_column("booking", sa.Column("payment_cash", sa.Numeric(10, 2), nullable=True))
    op.add_column("booking", sa.Column("payment_card", sa.Numeric(10, 2), nullable=True))

    op.add_column(
        "master",
        sa.Column("reports_access", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "user",
        sa.Column("reports_access", sa.Boolean(), nullable=False, server_default="false"),
    )

    expense_category_enum = ENUM(
        "rent",
        "utilities",
        "supplies",
        "advertising",
        "equipment",
        "taxes",
        "software",
        "training",
        "salary_bonus",
        "other",
        name="expense_category",
        create_type=False,
    )
    expense_category_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "expense",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("category", expense_category_enum, nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("created_by_id", UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_expense_date", "expense", ["date"])

    salary_type_enum = ENUM(
        "percent", "fixed", "mixed", name="salary_type", create_type=False
    )
    salary_type_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "salary_settings",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("master_id", UUID(as_uuid=True), sa.ForeignKey("master.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "salary_type",
            salary_type_enum,
            nullable=False,
            server_default="percent",
        ),
        sa.Column("percent_value", sa.Numeric(5, 2), nullable=True),
        sa.Column("fixed_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("monthly_norm", sa.Numeric(12, 2), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("master_id", name="uq_salary_settings_master_id"),
    )

    salary_payment_status_enum = ENUM(
        "calculated", "paid", name="salary_payment_status", create_type=False
    )
    salary_payment_status_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "salary_payment",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("master_id", UUID(as_uuid=True), sa.ForeignKey("master.id", ondelete="CASCADE"), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("revenue_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("calculated_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("paid_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column(
            "status",
            salary_payment_status_enum,
            nullable=False,
            server_default="calculated",
        ),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_id", UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_salary_payment_master_period",
        "salary_payment",
        ["master_id", "period_start", "period_end"],
    )


def downgrade() -> None:
    op.drop_index("ix_salary_payment_master_period", table_name="salary_payment")
    op.drop_table("salary_payment")
    op.drop_table("salary_settings")
    op.drop_index("ix_expense_date", table_name="expense")
    op.drop_table("expense")
    op.drop_column("user", "reports_access")
    op.drop_column("master", "reports_access")
    op.drop_column("booking", "payment_card")
    op.drop_column("booking", "payment_cash")
    op.drop_column("booking", "payment_method")
    op.execute("DROP TYPE IF EXISTS salary_payment_status")
    op.execute("DROP TYPE IF EXISTS salary_type")
    op.execute("DROP TYPE IF EXISTS expense_category")
    op.execute("DROP TYPE IF EXISTS payment_method")
