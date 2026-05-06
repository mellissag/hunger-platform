"""phase37: service duration_type/max, booking needs_consultation

Revision ID: 0019_phase37
Revises: 0018_auto_triggers_and_logs
Create Date: 2026-05-05

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0019_phase37"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── service: duration_type + duration_max_minutes ────────────────────
    op.add_column(
        "service",
        sa.Column(
            "duration_type",
            sa.String(length=10),
            nullable=False,
            server_default="fixed",
        ),
    )
    op.add_column(
        "service",
        sa.Column("duration_max_minutes", sa.Integer(), nullable=True),
    )

    # ── booking: needs_consultation + make master/time nullable ──────────
    op.add_column(
        "booking",
        sa.Column(
            "needs_consultation",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )
    op.alter_column("booking", "master_id", existing_type=sa.UUID(), nullable=True)
    op.alter_column(
        "booking",
        "starts_at",
        existing_type=sa.DateTime(timezone=True),
        nullable=True,
    )
    op.alter_column(
        "booking",
        "ends_at",
        existing_type=sa.DateTime(timezone=True),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column("booking", "ends_at", existing_type=sa.DateTime(timezone=True), nullable=False)
    op.alter_column("booking", "starts_at", existing_type=sa.DateTime(timezone=True), nullable=False)
    op.alter_column("booking", "master_id", existing_type=sa.UUID(), nullable=False)
    op.drop_column("booking", "needs_consultation")
    op.drop_column("service", "duration_max_minutes")
    op.drop_column("service", "duration_type")
