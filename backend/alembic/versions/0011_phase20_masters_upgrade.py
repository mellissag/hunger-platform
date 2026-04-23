"""Phase 20: masters HR — working_hours, portfolio, tg_user_id, certificates, review flex, manual bookings."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "master",
        sa.Column(
            "working_hours",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.add_column(
        "master",
        sa.Column(
            "portfolio",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column("master", sa.Column("tg_user_id", sa.BigInteger(), nullable=True))
    op.add_column(
        "master",
        sa.Column(
            "certificates",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )

    op.execute(
        sa.text(
            """
            DO $$ BEGIN
                ALTER TYPE booking_created_via ADD VALUE 'manual';
            EXCEPTION
                WHEN duplicate_object THEN NULL;
            END $$
            """
        )
    )

    op.add_column(
        "review",
        sa.Column("source", sa.String(length=20), nullable=False, server_default="bot"),
    )
    op.add_column(
        "review",
        sa.Column("is_visible", sa.Boolean(), nullable=False, server_default="true"),
    )
    op.execute(sa.text("UPDATE review SET is_visible = is_published"))
    op.drop_column("review", "is_published")

    op.drop_constraint("review_booking_id_key", "review", type_="unique")
    op.alter_column("review", "booking_id", existing_type=postgresql.UUID(as_uuid=True), nullable=True)
    op.create_index(
        "uq_review_booking_id_partial",
        "review",
        ["booking_id"],
        unique=True,
        postgresql_where=sa.text("booking_id IS NOT NULL"),
    )

    op.drop_constraint("review_booking_id_fkey", "review", type_="foreignkey")
    op.create_foreign_key(
        "review_booking_id_fkey",
        "review",
        "booking",
        ["booking_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.drop_constraint("review_client_id_fkey", "review", type_="foreignkey")
    op.alter_column("review", "client_id", existing_type=postgresql.UUID(as_uuid=True), nullable=True)
    op.create_foreign_key(
        "review_client_id_fkey",
        "review",
        "client",
        ["client_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_index("idx_review_master_rating", "review", ["master_id", "rating"])


def downgrade() -> None:
    op.drop_index("uq_review_booking_id_partial", table_name="review")
    op.drop_index("idx_review_master_rating", table_name="review")

    op.drop_constraint("review_booking_id_fkey", "review", type_="foreignkey")
    op.create_foreign_key(
        "review_booking_id_fkey",
        "review",
        "booking",
        ["booking_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.drop_constraint("review_client_id_fkey", "review", type_="foreignkey")
    op.alter_column("review", "client_id", existing_type=postgresql.UUID(as_uuid=True), nullable=False)
    op.create_foreign_key(
        "review_client_id_fkey",
        "review",
        "client",
        ["client_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.alter_column("review", "booking_id", existing_type=postgresql.UUID(as_uuid=True), nullable=False)
    op.create_unique_constraint("review_booking_id_key", "review", ["booking_id"])
    # downgrade assumes no NULL booking_id rows

    op.add_column(
        "review",
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default="true"),
    )
    op.execute(sa.text("UPDATE review SET is_published = is_visible"))
    op.drop_column("review", "is_visible")
    op.drop_column("review", "source")

    op.drop_column("master", "certificates")
    op.drop_column("master", "tg_user_id")
    op.drop_column("master", "portfolio")
    op.drop_column("master", "working_hours")
