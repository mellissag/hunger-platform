"""seed default client loyalty statuses

Revision ID: 0036_seed_default_client_statuses
Revises: 0035_loyalty_system
Create Date: 2026-05-15

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0036_seed_default_client_statuses"
down_revision = "0035_loyalty_system"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    count = conn.execute(sa.text("SELECT COUNT(*) FROM client_status")).scalar()
    if count and int(count) > 0:
        return

    op.execute(
        sa.text(
            """
            INSERT INTO client_status (
                id, name_ru, name_en, name_uk, name_bg,
                background_color, text_color,
                discount_percent, points_multiplier,
                min_visits, min_spent, sort_order
            ) VALUES
            (
                gen_random_uuid(),
                'Новый', 'New', 'Новий', 'Нов',
                '#8A7D6A', '#FFFFFF',
                NULL, 1.0,
                NULL, NULL, 0
            ),
            (
                gen_random_uuid(),
                'Постоянный', 'Regular', 'Постійний', 'Редовен',
                '#4A7C59', '#FFFFFF',
                NULL, 1.25,
                3, NULL, 1
            ),
            (
                gen_random_uuid(),
                'VIP', 'VIP', 'VIP', 'VIP',
                '#C9A84C', '#1A1408',
                5, 1.5,
                8, NULL, 2
            ),
            (
                gen_random_uuid(),
                'Платина', 'Platinum', 'Платина', 'Платина',
                '#2C2416', '#C9A84C',
                10, 2.0,
                15, 500.00, 3
            )
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM client_status
            WHERE name_en IN ('New', 'Regular', 'VIP', 'Platinum')
            """
        )
    )
