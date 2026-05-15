"""Бизнес-логика лояльности: баллы, промокоды, рефералы, статусы."""

from __future__ import annotations

import secrets
import string
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

import app.core.clock as clock
from app.config import get_settings
from app.core.exceptions import NotFoundError
from app.models.booking import Booking
from app.models.catalog import Service
from app.models.client import Client
from app.models.enums import (
    BookingStatus,
    LoyaltyTransactionType,
    PromoDiscountType,
    ReferralRewardMode,
    ReferralTrigger,
)
from app.models.loyalty import (
    ClientStatus,
    LoyaltySettings,
    LoyaltyTransaction,
    PromoCode,
    ReferralCode,
)

_REFERRAL_ALPHABET = string.ascii_uppercase + string.digits


def _status_name(status: ClientStatus, lang: str) -> str:
    key = f"name_{lang}"
    val = getattr(status, key, None)
    if isinstance(val, str) and val.strip():
        return val.strip()
    for fallback in ("ru", "en", "uk", "bg"):
        v = getattr(status, f"name_{fallback}", "")
        if isinstance(v, str) and v.strip():
            return v.strip()
    return status.name_en


async def get_loyalty_settings(db: AsyncSession) -> LoyaltySettings:
    row = (await db.execute(select(LoyaltySettings).limit(1))).scalar_one_or_none()
    if row is None:
        row = LoyaltySettings()
        db.add(row)
        await db.flush()
    return row


def _final_booking_amount(booking: Booking) -> Decimal:
    base = Decimal(booking.price)
    promo = Decimal(booking.promo_discount_amount or 0)
    points_disc = Decimal(booking.points_spent_discount or 0)
    return max(Decimal("0"), base - promo - points_disc)


def _compute_promo_discount(promo: PromoCode, price: Decimal) -> Decimal:
    if promo.discount_type == PromoDiscountType.percent:
        return (price * promo.discount_value / Decimal(100)).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
    return min(promo.discount_value, price).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


async def _client_promo_uses(db: AsyncSession, promo_id: UUID, client_id: UUID) -> int:
    n = await db.scalar(
        select(func.count(Booking.id)).where(
            Booking.promo_code_id == promo_id,
            Booking.client_id == client_id,
            Booking.status.notin_(
                (
                    BookingStatus.cancelled_by_client,
                    BookingStatus.cancelled_by_salon,
                )
            ),
        )
    )
    return int(n or 0)


class PromoValidationError(Exception):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


async def validate_promo_code(
    db: AsyncSession,
    *,
    code: str,
    booking_amount: Decimal,
    client_id: UUID | None = None,
) -> tuple[PromoCode, Decimal]:
    normalized = code.strip().upper()
    promo = (
        await db.execute(
            select(PromoCode).where(
                func.upper(PromoCode.code) == normalized,
                PromoCode.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if promo is None or not promo.is_active:
        raise PromoValidationError("not_found")

    today = clock.utc_now().date()
    if promo.valid_from is not None and today < promo.valid_from:
        raise PromoValidationError("not_found")
    if promo.valid_until is not None and today > promo.valid_until:
        raise PromoValidationError("expired")
    if promo.max_uses is not None and promo.uses_count >= promo.max_uses:
        raise PromoValidationError("limit_reached")
    if promo.min_booking_amount is not None and booking_amount < promo.min_booking_amount:
        raise PromoValidationError("min_amount")
    if client_id is not None and promo.max_uses_per_client is not None:
        used = await _client_promo_uses(db, promo.id, client_id)
        if used >= promo.max_uses_per_client:
            raise PromoValidationError("client_limit")

    discount = _compute_promo_discount(promo, booking_amount)
    return promo, discount


async def apply_promo_to_booking(
    db: AsyncSession,
    booking: Booking,
    promo_code_str: str,
    client_id: UUID,
) -> None:
    promo, discount = await validate_promo_code(
        db,
        code=promo_code_str,
        booking_amount=Decimal(booking.price),
        client_id=client_id,
    )
    booking.promo_code_id = promo.id
    booking.promo_discount_amount = discount
    booking.price = max(Decimal("0"), Decimal(booking.price) - discount)
    promo.uses_count = int(promo.uses_count) + 1
    await db.flush()


def _generate_referral_code() -> str:
    return "".join(secrets.choice(_REFERRAL_ALPHABET) for _ in range(8))


async def get_or_create_referral_code(db: AsyncSession, client_id: UUID) -> ReferralCode:
    existing = (
        await db.execute(select(ReferralCode).where(ReferralCode.client_id == client_id))
    ).scalar_one_or_none()
    if existing is not None:
        return existing

    for _ in range(20):
        code = _generate_referral_code()
        collision = (
            await db.execute(select(ReferralCode.id).where(ReferralCode.code == code))
        ).scalar_one_or_none()
        if collision is None:
            row = ReferralCode(client_id=client_id, code=code)
            db.add(row)
            await db.flush()
            return row
    raise RuntimeError("Could not generate unique referral code")


def referral_link(code: str) -> str:
    username = (get_settings().telegram_bot_username or "").strip().lstrip("@")
    if not username:
        return f"?startapp={code}"
    return f"https://t.me/{username}?startapp={code}"


async def process_referral_start_param(
    db: AsyncSession,
    client: Client,
    start_param: str | None,
) -> None:
    if not start_param or client.referred_by_client_id is not None:
        return
    code = start_param.strip().upper()
    if len(code) != 8 or not all(c in _REFERRAL_ALPHABET for c in code):
        return

    ref = (
        await db.execute(select(ReferralCode).where(ReferralCode.code == code))
    ).scalar_one_or_none()
    if ref is None or ref.client_id == client.id:
        return

    client.referred_by_client_id = ref.client_id
    ref.uses_count = int(ref.uses_count) + 1
    await db.flush()

    settings = await get_loyalty_settings(db)
    if not settings.referral_enabled:
        return
    if settings.referral_trigger == ReferralTrigger.on_registration:
        await _grant_referral_bonuses(db, invited=client, settings=settings, booking_id=None)


async def _add_transaction(
    db: AsyncSession,
    *,
    client_id: UUID,
    points: int,
    tx_type: LoyaltyTransactionType,
    description: str,
    booking_id: UUID | None = None,
) -> LoyaltyTransaction:
    client = await db.get(Client, client_id)
    if client is None:
        raise NotFoundError("Client not found")
    client.loyalty_points = int(client.loyalty_points or 0) + points
    tx = LoyaltyTransaction(
        client_id=client_id,
        booking_id=booking_id,
        type=tx_type,
        points=points,
        description=description,
    )
    db.add(tx)
    await db.flush()
    return tx


async def _grant_referral_bonuses(
    db: AsyncSession,
    *,
    invited: Client,
    settings: LoyaltySettings,
    booking_id: UUID | None,
) -> None:
    if not settings.referral_enabled or invited.referred_by_client_id is None:
        return

    referrer_id = invited.referred_by_client_id
    mode = settings.referral_reward_mode

    if mode in (ReferralRewardMode.both, ReferralRewardMode.referrer_only):
        bonus = int(settings.referral_bonus_referrer)
        if bonus > 0:
            await _add_transaction(
                db,
                client_id=referrer_id,
                points=bonus,
                tx_type=LoyaltyTransactionType.referral_bonus,
                description="Реферальный бонус",
                booking_id=booking_id,
            )

    if mode in (ReferralRewardMode.both, ReferralRewardMode.invited_only):
        bonus = int(settings.referral_bonus_invited)
        if bonus > 0:
            await _add_transaction(
                db,
                client_id=invited.id,
                points=bonus,
                tx_type=LoyaltyTransactionType.referral_bonus,
                description="Реферальный бонус",
                booking_id=booking_id,
            )


async def _auto_assign_status(db: AsyncSession, client: Client) -> None:
    if client.status_assigned_manually:
        return

    statuses = (
        await db.execute(select(ClientStatus).order_by(ClientStatus.sort_order.desc()))
    ).scalars().all()

    visits = int(client.total_visits or 0)
    spent = Decimal(client.total_spent or 0)
    best: ClientStatus | None = None

    for st in statuses:
        visits_ok = st.min_visits is not None and visits >= st.min_visits
        spent_ok = st.min_spent is not None and spent >= st.min_spent
        if st.min_visits is None and st.min_spent is None:
            continue
        if visits_ok or spent_ok:
            if best is None or st.sort_order > best.sort_order:
                best = st

    client.status_id = best.id if best else None
    await db.flush()


async def on_booking_completed(db: AsyncSession, booking: Booking) -> None:
    if booking.points_earned and booking.points_earned > 0:
        return

    client = await db.get(Client, booking.client_id)
    service = await db.get(Service, booking.service_id)
    if client is None or service is None:
        return

    was_first_visit = int(client.total_visits or 0) == 0

    base_points = int(service.loyalty_points or 0)
    multiplier = Decimal("1.0")
    if client.status_id:
        status = await db.get(ClientStatus, client.status_id)
        if status is not None:
            multiplier = Decimal(status.points_multiplier or 1)

    earned = int((Decimal(base_points) * multiplier).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    if earned > 0:
        svc_name = (service.name_i18n or {}).get(client.lang) or (service.name_i18n or {}).get("ru") or ""
        await _add_transaction(
            db,
            client_id=client.id,
            points=earned,
            tx_type=LoyaltyTransactionType.earned,
            description=svc_name or "Услуга",
            booking_id=booking.id,
        )
        booking.points_earned = earned

    amount = _final_booking_amount(booking)
    client.total_visits = int(client.total_visits or 0) + 1
    client.total_spent = Decimal(client.total_spent or 0) + amount
    client.total_bookings = int(client.total_bookings or 0) + 1
    client.total_revenue = Decimal(client.total_revenue or 0) + amount
    client.last_visit_at = booking.ends_at or booking.starts_at or clock.utc_now()

    await _auto_assign_status(db, client)

    settings = await get_loyalty_settings(db)
    if was_first_visit and client.referred_by_client_id:
        trigger_ok = settings.referral_trigger == ReferralTrigger.on_first_visit
        if trigger_ok and settings.referral_enabled:
            await _grant_referral_bonuses(
                db,
                invited=client,
                settings=settings,
                booking_id=booking.id,
            )

    await db.flush()


async def adjust_client_points(
    db: AsyncSession,
    client_id: UUID,
    points: int,
    description: str,
) -> LoyaltyTransaction:
    return await _add_transaction(
        db,
        client_id=client_id,
        points=points,
        tx_type=LoyaltyTransactionType.manual_adjustment,
        description=description,
    )


async def resolve_client_status_discount(
    db: AsyncSession, client: Client, base_price: Decimal
) -> Decimal:
    if not client.status_id:
        return Decimal("0")
    status = await db.get(ClientStatus, client.status_id)
    if status is None or status.discount_percent is None or status.discount_percent <= 0:
        return Decimal("0")
    return (base_price * Decimal(status.discount_percent) / Decimal(100)).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )


async def build_me_loyalty(db: AsyncSession, client: Client, lang: str) -> dict:
    settings = await get_loyalty_settings(db)
    status_out = None
    next_status_out = None
    visits_remaining: int | None = None
    spent_remaining: Decimal | None = None

    if client.status_id:
        st = await db.get(ClientStatus, client.status_id)
        if st is not None:
            status_out = {
                "name": _status_name(st, lang),
                "background_color": st.background_color,
                "text_color": st.text_color,
                "discount_percent": st.discount_percent,
                "points_multiplier": st.points_multiplier,
            }

    all_statuses = (
        await db.execute(select(ClientStatus).order_by(ClientStatus.sort_order.asc()))
    ).scalars().all()
    current_order = 0
    if client.status_id:
        cur = await db.get(ClientStatus, client.status_id)
        if cur:
            current_order = cur.sort_order

    for st in all_statuses:
        if st.sort_order <= current_order:
            continue
        if st.min_visits is None and st.min_spent is None:
            continue
        next_status_out = {
            "name": _status_name(st, lang),
            "background_color": st.background_color,
            "text_color": st.text_color,
            "discount_percent": st.discount_percent,
            "points_multiplier": st.points_multiplier,
        }
        if st.min_visits is not None:
            visits_remaining = max(0, st.min_visits - int(client.total_visits or 0))
        if st.min_spent is not None:
            spent_remaining = max(
                Decimal("0"),
                Decimal(st.min_spent) - Decimal(client.total_spent or 0),
            )
        break

    ref_code = None
    ref_link = None
    if settings.referral_enabled:
        ref = await get_or_create_referral_code(db, client.id)
        ref_code = ref.code
        ref_link = referral_link(ref.code)

    return {
        "points": int(client.loyalty_points or 0),
        "points_value_eur": settings.points_value_eur,
        "status": status_out,
        "referral_code": ref_code,
        "referral_link": ref_link,
        "referral_enabled": settings.referral_enabled,
        "referral_bonus_referrer": settings.referral_bonus_referrer,
        "referral_bonus_invited": settings.referral_bonus_invited,
        "referral_reward_mode": settings.referral_reward_mode,
        "next_status": next_status_out,
        "next_status_visits_remaining": visits_remaining,
        "next_status_spent_remaining": spent_remaining,
    }
