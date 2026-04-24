"""Set default working_hours for masters."""

from __future__ import annotations

from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.get_bind().exec_driver_sql(
        """
        UPDATE master
        SET working_hours = '{
          "1": {"start":"09:00","end":"18:00","enabled":true},
          "2": {"start":"09:00","end":"18:00","enabled":true},
          "3": {"start":"09:00","end":"18:00","enabled":true},
          "4": {"start":"09:00","end":"18:00","enabled":true},
          "5": {"start":"09:00","end":"18:00","enabled":true},
          "6": {"start":"10:00","end":"15:00","enabled":true},
          "7": {"start":"00:00","end":"00:00","enabled":false}
        }'::jsonb
        WHERE working_hours IS NULL OR working_hours = '{}'::jsonb
        """
    )


def downgrade() -> None:
    # Data migration: keep populated working hours.
    return None
