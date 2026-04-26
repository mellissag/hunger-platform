"""Phase 26 v2: replace inventory tables with supply_invoices schema + new color_formula."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop old tables from 0014/0015 that need to be replaced
    op.drop_table("product_write_off")
    op.drop_table("product_arrival")
    op.drop_table("color_formula")
    op.drop_table("product")

    # New product table (cost_price instead of price_per_unit)
    op.create_table(
        "product",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("brand", sa.String(100), nullable=True),
        sa.Column("sku", sa.String(100), nullable=True),
        sa.Column("unit", sa.String(20), nullable=False, server_default="шт"),
        sa.Column("category", sa.String(100), nullable=True),
        sa.Column("min_stock", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("current_stock", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("cost_price", sa.Numeric(10, 2), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # Supply invoices (накладные)
    op.create_table(
        "supply_invoice",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("invoice_number", sa.String(100), nullable=True),
        sa.Column("supplier", sa.String(200), nullable=True),
        sa.Column("arrived_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("total_cost", sa.Numeric(10, 2), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "received_by_id",
            UUID(as_uuid=True),
            sa.ForeignKey("user.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # Supply invoice items (позиции накладной)
    op.create_table(
        "supply_invoice_item",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "invoice_id",
            sa.Integer(),
            sa.ForeignKey("supply_invoice.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "product_id",
            sa.Integer(),
            sa.ForeignKey("product.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("quantity", sa.Numeric(10, 2), nullable=False),
        sa.Column("price_per_unit", sa.Numeric(10, 2), nullable=True),
        sa.Column("total", sa.Numeric(10, 2), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
    )

    # Product write-offs (списания)
    op.create_table(
        "product_write_off",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
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
        sa.Column("written_off_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # Color formulas — JSONB components
    op.create_table(
        "color_formula",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "client_id",
            UUID(as_uuid=True),
            sa.ForeignKey("client.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "master_id",
            UUID(as_uuid=True),
            sa.ForeignKey("master.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "booking_id",
            UUID(as_uuid=True),
            sa.ForeignKey("booking.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("components", JSONB, nullable=False, server_default="[]"),
        sa.Column("service_name", sa.String(200), nullable=True),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("result_notes", sa.Text(), nullable=True),
        sa.Column("exposure_minutes", sa.Integer(), nullable=True),
        sa.Column("photo_urls", JSONB, nullable=True, server_default="[]"),
        sa.Column("client_rating", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_color_formula_client_id", "color_formula", ["client_id"])


def downgrade() -> None:
    op.drop_index("ix_color_formula_client_id", "color_formula")
    op.drop_table("color_formula")
    op.drop_table("product_write_off")
    op.drop_table("supply_invoice_item")
    op.drop_table("supply_invoice")
    op.drop_table("product")
