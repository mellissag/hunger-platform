"""Автозавершение прошедших подтверждённых записей и начисление лояльности."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select

import app.core.clock as clock
from app.models.booking import Booking
from app.models.enums import BookingStatus
from app.services import loyalty_service

logger = logging.getLogger(__name__)


async def auto_complete_past_bookings(ctx: dict[str, Any]) -> None:
    """Переводит confirmed-записи с прошедшим ends_at в completed и начисляет визит."""
    factory = ctx["db"]
    now = clock.utc_now()

    async with factory() as session:
        rows = (
            await session.execute(
                select(Booking).where(
                    Booking.status == BookingStatus.confirmed,
                    Booking.ends_at.is_not(None),
                    Booking.ends_at <= now,
                )
            )
        ).scalars().all()

        if not rows:
            return

        count = 0
        for booking in rows:
            booking.status = BookingStatus.completed
            await loyalty_service.on_booking_completed(session, booking)
            count += 1

        await session.commit()
        if count:
            logger.info("auto_complete_past_bookings: completed %s booking(s)", count)
