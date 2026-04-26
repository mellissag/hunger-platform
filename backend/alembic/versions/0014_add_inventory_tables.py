"""Add inventory tables: products, product_arrivals, product_write_offs."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "product",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("category", sa.String(100), nullable=True),
        sa.Column("brand", sa.String(100), nullable=True),
        sa.Column("sku", sa.String(100), nullable=True),
        sa.Column("unit", sa.String(20), nullable=False, server_default="шт"),
        sa.Column("min_stock", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("current_stock", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("price_per_unit", sa.Numeric(10, 2), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    op.create_table(
        "product_arrival",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("arrived_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "product_id",
            sa.Integer(),
            sa.ForeignKey("product.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("quantity", sa.Numeric(10, 2), nullable=False),
        sa.Column("price_per_unit", sa.Numeric(10, 2), nullable=True),
        sa.Column("total_cost", sa.Numeric(10, 2), nullable=True),
        sa.Column("supplier", sa.String(200), nullable=True),
        sa.Column("invoice_number", sa.String(100), nullable=True),
        sa.Column(
            "received_by",
            UUID(as_uuid=True),
            sa.ForeignKey("user.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    op.create_table(
        "product_write_off",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("written_off_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "product_id",
            sa.Integer(),
            sa.ForeignKey("product.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("quantity", sa.Numeric(10, 2), nullable=False),
        sa.Column("reason", sa.String(200), nullable=True),
        sa.Column(
            "booking_id",
            UUID(as_uuid=True),
            sa.ForeignKey("booking.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "master_id",
            UUID(as_uuid=True),
            sa.ForeignKey("master.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_table("product_write_off")
    op.drop_table("product_arrival")
    op.drop_table("product")
