"""Promo codes: soft delete blocks validation forever for that code string."""

from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.models.loyalty import PromoCode
from app.models.enums import PromoDiscountType
from app.services.loyalty_service import PromoValidationError, validate_promo_code


@pytest_asyncio.fixture
async def db_session():
    from app.db.base import get_async_session_factory

    factory = get_async_session_factory()
    async with factory() as session:
        yield session


@pytest.mark.asyncio
async def test_deleted_promo_code_not_validated(db_session):
    code = f"DEL{uuid4().hex[:6].upper()}"
    promo = PromoCode(
        code=code,
        discount_type=PromoDiscountType.percent,
        discount_value=Decimal("10"),
        is_active=True,
    )
    db_session.add(promo)
    await db_session.flush()

    promo_db, _ = await validate_promo_code(
        db_session, code=code, booking_amount=Decimal("100")
    )
    assert promo_db.id == promo.id

    from datetime import datetime, timezone

    promo.deleted_at = datetime.now(timezone.utc)
    promo.is_active = False
    await db_session.flush()

    with pytest.raises(PromoValidationError) as exc:
        await validate_promo_code(db_session, code=code, booking_amount=Decimal("100"))
    assert exc.value.code == "not_found"

    still = (
        await db.execute(select(PromoCode).where(PromoCode.code == code))
    ).scalar_one_or_none()
    assert still is not None
    assert still.deleted_at is not None
