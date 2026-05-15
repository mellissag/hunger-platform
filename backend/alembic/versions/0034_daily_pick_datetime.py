"""daily_picks: valid_from / valid_to as timestamptz

Revision ID: 0034_daily_pick_datetime
Revises: 0033_booking_created_via_whatsapp
Create Date: 2026-05-15

"""

from __future__ import annotations

from alembic import op

revision = "0034_daily_pick_datetime"
down_revision = "0033_booking_created_via_whatsapp"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE daily_picks
        ALTER COLUMN valid_from TYPE TIMESTAMP WITH TIME ZONE
        USING CASE
            WHEN valid_from IS NOT NULL
            THEN (valid_from::timestamp AT TIME ZONE 'Europe/Sofia')
            ELSE NULL
        END
        """
    )
    op.execute(
        """
        ALTER TABLE daily_picks
        ALTER COLUMN valid_to TYPE TIMESTAMP WITH TIME ZONE
        USING CASE
            WHEN valid_to IS NOT NULL
            THEN ((valid_to + TIME '23:59:59') AT TIME ZONE 'Europe/Sofia')
            ELSE NULL
        END
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE daily_picks
        ALTER COLUMN valid_from TYPE DATE
        USING CASE
            WHEN valid_from IS NOT NULL
            THEN (valid_from AT TIME ZONE 'Europe/Sofia')::date
            ELSE NULL
        END
        """
    )
    op.execute(
        """
        ALTER TABLE daily_picks
        ALTER COLUMN valid_to TYPE DATE
        USING CASE
            WHEN valid_to IS NOT NULL
            THEN (valid_to AT TIME ZONE 'Europe/Sofia')::date
            ELSE NULL
        END
        """
    )
