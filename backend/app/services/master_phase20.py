"""Phase 20: мастер — портфолио, отзывы, статистика, ручная запись, сброс пароля."""

from __future__ import annotations

import os
import uuid
from calendar import monthrange
from collections import Counter, defaultdict
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any
from uuid import UUID

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenScopeError, InvalidScheduleError, NotFoundError
from app.core.scope import ensure_master_own_master_id
from app.core.security import hash_password
from app.models.booking import Booking, Review
from app.models.catalog import MasterService, Service
from app.models.client import Client
from app.models.enums import BookingCreatedVia, BookingStatus, UserRole
from app.models.master import Master
from app.models.user import AuthSession, User
from app.schemas.booking import BookingCreate
from app.schemas.master import (
    ManualBookingCreate,
    MasterStatsOut,
    MastersTodayStatsOut,
    PasswordResetData,
    ReviewClientBrief,
    ReviewCreate,
    ReviewOut,
    ReviewsPageOut,
)
from app.services import booking_service, schedule_service


UPLOAD_ROOT = Path(os.environ.get("UPLOAD_DIR", "./data/uploads"))


def _media_url(rel: str) -> str:
    return f"/media/{rel.lstrip('/')}"


async def save_master_upload(master_id: UUID, file_bytes: bytes, ext: str, subdir: str, name: str) -> str:
    safe_ext = ext if ext.startswith(".") else f".{ext}"
    if safe_ext.lower() not in (".jpg", ".jpeg", ".png", ".webp"):
        raise InvalidScheduleError("Unsupported image type")
    rel_dir = f"masters/{master_id}/{subdir}"
    dest_dir = UPLOAD_ROOT / rel_dir
    dest_dir.mkdir(parents=True, exist_ok=True)
    fname = f"{name}{safe_ext}"
    dest = dest_dir / fname
    dest.write_bytes(file_bytes)
    return _media_url(f"{rel_dir}/{fname}")


async def upload_master_photo(db: AsyncSession, master_id: UUID, file_bytes: bytes, ext: str) -> str:
    m = await db.get(Master, master_id)
    if m is None:
        raise NotFoundError("Master not found")
    url = await save_master_upload(master_id, file_bytes, ext, "avatar", "photo")
    m.photo_url = url
    m.updated_at = datetime.now(tz=UTC)
    await db.flush()
    return url


async def add_portfolio_item(
    db: AsyncSession,
    master_id: UUID,
    file_bytes: bytes,
    ext: str,
    caption: str | None,
) -> list[dict[str, Any]]:
    m = await db.get(Master, master_id)
    if m is None:
        raise NotFoundError("Master not found")
    uid = uuid.uuid4().hex[:10]
    url = await save_master_upload(master_id, file_bytes, ext, "portfolio", f"p_{uid}")
    items = list(m.portfolio or [])
    items.append({"url": url, "caption": caption or "", "sort": len(items)})
    m.portfolio = items
    m.updated_at = datetime.now(tz=UTC)
    await db.flush()
    return items


async def delete_portfolio_item(db: AsyncSession, master_id: UUID, index: int) -> list[dict[str, Any]]:
    m = await db.get(Master, master_id)
    if m is None:
        raise NotFoundError("Master not found")
    items = list(m.portfolio or [])
    if index < 0 or index >= len(items):
        raise NotFoundError("Portfolio item not found")
    items.pop(index)
    m.portfolio = items
    m.updated_at = datetime.now(tz=UTC)
    await db.flush()
    return items


async def list_reviews_page(
    db: AsyncSession,
    master_id: UUID,
    *,
    page: int,
    page_size: int,
) -> ReviewsPageOut:
    vis = (Review.master_id == master_id) & (Review.is_visible.is_(True))
    total = int((await db.scalar(select(func.count()).select_from(Review).where(vis))) or 0)
    if total == 0:
        return ReviewsPageOut(items=[], total=0, avg=None, breakdown={})

    rows = (
        (
            await db.execute(
                select(Review)
                .where(vis)
                .order_by(Review.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        .scalars()
        .all()
    )

    client_ids = {r.client_id for r in rows if r.client_id}
    clients: dict[UUID, Client] = {}
    if client_ids:
        crows = (await db.execute(select(Client).where(Client.id.in_(client_ids)))).scalars().all()
        clients = {c.id: c for c in crows}

    items_out: list[ReviewOut] = []
    for r in rows:
        cb = None
        if r.client_id and r.client_id in clients:
            c = clients[r.client_id]
            nm = " ".join(x for x in (c.first_name or "", c.last_name or "") if x).strip() or None
            cb = ReviewClientBrief(id=c.id, name=nm)
        items_out.append(
            ReviewOut(
                id=r.id,
                master_id=r.master_id,
                client_id=r.client_id,
                booking_id=r.booking_id,
                rating=r.rating,
                text=r.comment,
                source=r.source,
                is_visible=r.is_visible,
                created_at=r.created_at,
                client=cb,
            )
        )

    avg_v = await db.scalar(
        select(func.avg(Review.rating)).where(Review.master_id == master_id, Review.is_visible.is_(True))
    )
    br_rows = (
        (
            await db.execute(
                select(Review.rating, func.count())
                .where(Review.master_id == master_id, Review.is_visible.is_(True))
                .group_by(Review.rating)
            )
        )
        .all()
    )
    breakdown = {str(rating): int(cnt) for rating, cnt in br_rows}
    return ReviewsPageOut(
        items=items_out,
        total=total,
        avg=float(avg_v) if avg_v is not None else None,
        breakdown=breakdown,
    )


async def recalc_master_rating(db: AsyncSession, master_id: UUID) -> None:
    avg_v = await db.scalar(
        select(func.avg(Review.rating)).where(Review.master_id == master_id, Review.is_visible.is_(True))
    )
    cnt = int(
        (
            await db.scalar(
                select(func.count()).where(Review.master_id == master_id, Review.is_visible.is_(True))
            )
        )
        or 0
    )
    avg_dec: Decimal | None
    if cnt == 0:
        avg_dec = None
    else:
        avg_dec = Decimal(str(round(float(avg_v or 0), 2)))
    await db.execute(
        update(Master)
        .where(Master.id == master_id)
        .values(
            rating_avg=avg_dec,
            rating_count=cnt,
        )
    )


async def add_manual_review(
    db: AsyncSession,
    master_id: UUID,
    data: ReviewCreate,
) -> Review:
    r = Review(
        master_id=master_id,
        client_id=data.client_id,
        booking_id=None,
        rating=data.rating,
        comment=data.text,
        source=data.source,
        is_visible=True,
    )
    db.add(r)
    await db.flush()
    await recalc_master_rating(db, master_id)
    await db.refresh(r)
    return r


async def soft_delete_review(db: AsyncSession, master_id: UUID, review_id: UUID) -> None:
    r = await db.get(Review, review_id)
    if r is None or r.master_id != master_id:
        raise NotFoundError("Review not found")
    r.is_visible = False
    await db.flush()
    await recalc_master_rating(db, master_id)


async def reset_master_password(db: AsyncSession, master_id: UUID, data: PasswordResetData) -> None:
    row = (await db.execute(select(User).where(User.master_id == master_id))).scalar_one_or_none()
    if row is None:
        raise NotFoundError("User for master not found")
    row.password_hash = hash_password(data.new_password)
    row.updated_at = datetime.now(tz=UTC)
    await db.execute(
        update(AuthSession).where(AuthSession.user_id == row.id).values(revoked_at=datetime.now(tz=UTC))
    )
    await db.flush()


def _period_range(period: str) -> tuple[datetime, datetime]:
    now = datetime.now(tz=UTC)
    d_end = now
    if period == "week":
        d_start = now - timedelta(days=7)
    elif period == "month":
        d_start = now - timedelta(days=31)
    elif period == "3months":
        d_start = now - timedelta(days=93)
    elif period == "year":
        d_start = now - timedelta(days=366)
    else:
        d_start = now - timedelta(days=31)
    return d_start, d_end


async def get_master_stats(
    db: AsyncSession,
    user: User,
    master_id: UUID,
    *,
    period: str | None,
    from_date: date | None,
    to_date: date | None,
) -> MasterStatsOut:
    if user.role == UserRole.reception:
        raise ForbiddenScopeError("Statistics not available for reception")
    if user.role == UserRole.master:
        ensure_master_own_master_id(user, master_id)

    if from_date and to_date:
        z = UTC  # compare in UTC day boundaries simple
        d_start = datetime.combine(from_date, datetime.min.time(), tzinfo=z)
        d_end = datetime.combine(to_date, datetime.max.time(), tzinfo=z)
    else:
        d_start, d_end = _period_range(period or "month")

    base = select(Booking).where(Booking.master_id == master_id, Booking.starts_at >= d_start, Booking.starts_at <= d_end)
    bookings = (await db.execute(base)).scalars().all()

    total = len(bookings)
    completed = [b for b in bookings if b.status == BookingStatus.completed]
    cancelled = [
        b
        for b in bookings
        if b.status in (BookingStatus.cancelled_by_client, BookingStatus.cancelled_by_salon)
    ]
    no_show = len([b for b in bookings if b.status == BookingStatus.no_show])
    revenue = sum((b.price for b in completed), start=Decimal("0"))
    avg_check = float(revenue / len(completed)) if completed else None

    svc_counts: dict[UUID, tuple[int, Decimal]] = defaultdict(lambda: (0, Decimal("0")))
    for b in completed:
        cnt, rev = svc_counts[b.service_id]
        svc_counts[b.service_id] = (cnt + 1, rev + b.price)

    top: list[dict[str, Any]] = []
    for sid, (cnt, rev) in sorted(svc_counts.items(), key=lambda x: -x[1][1])[:5]:
        svc = await db.get(Service, sid)
        name_i18n = svc.name_i18n if svc else {}
        nm = str((name_i18n or {}).get("ru") or (name_i18n or {}).get("en") or "—")
        top.append({"service_name": nm, "count": cnt, "revenue": float(rev)})

    months: list[dict[str, Any]] = []
    today = datetime.now(tz=UTC).date()
    y, mo = today.year, today.month
    for _ in range(6):
        m_start = datetime(y, mo, 1, tzinfo=UTC)
        last = monthrange(y, mo)[1]
        m_end = datetime(y, mo, last, 23, 59, 59, 999999, tzinfo=UTC)
        sub = [b for b in completed if m_start <= b.starts_at <= m_end]
        rev_m = sum((b.price for b in sub), start=Decimal("0"))
        months.append({"month": f"{y}-{mo:02d}", "count": len(sub), "revenue": float(rev_m)})
        if mo == 1:
            y, mo = y - 1, 12
        else:
            mo -= 1
    months.reverse()

    client_id_list = [b.client_id for b in bookings]
    unique_clients = len(set(client_id_list))
    ctn = Counter(client_id_list)
    repeat_clients = sum(1 for _cid, n in ctn.items() if n > 1)

    m = await db.get(Master, master_id)
    ra = float(m.rating_avg) if m and m.rating_avg is not None else None
    rc = int(m.rating_count) if m else 0

    return MasterStatsOut(
        total_bookings=total,
        completed_bookings=len(completed),
        cancelled_bookings=len(cancelled),
        revenue=float(revenue),
        avg_check=avg_check,
        no_show_count=no_show,
        top_services=top,
        bookings_by_month=months,
        rating_avg=ra,
        rating_count=rc,
        unique_clients=unique_clients,
        repeat_clients=repeat_clients,
    )


async def masters_today_stats(db: AsyncSession, user: User) -> MastersTodayStatsOut:
    if user.role == UserRole.reception:
        raise ForbiddenScopeError()
    now = datetime.now(tz=UTC)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = day_start + timedelta(days=1)
    n_book = int(
        (
            await db.scalar(
                select(func.count())
                .select_from(Booking)
                .where(
                    Booking.starts_at >= day_start,
                    Booking.starts_at < day_end,
                    Booking.status.in_((BookingStatus.confirmed, BookingStatus.completed, BookingStatus.pending)),
                )
            )
        )
        or 0
    )
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    rev = await db.scalar(
        select(func.coalesce(func.sum(Booking.price), 0)).where(
            Booking.starts_at >= month_start,
            Booking.status == BookingStatus.completed,
        )
    )
    return MastersTodayStatsOut(bookings_today=n_book, revenue_month=float(rev or 0))


async def create_manual_master_booking(
    db: AsyncSession,
    user: User,
    master_id: UUID,
    data: ManualBookingCreate,
) -> Booking:
    if user.role not in (UserRole.owner, UserRole.admin, UserRole.reception):
        raise ForbiddenScopeError()
    body = BookingCreate(
        client_id=data.client_id,
        master_id=master_id,
        service_id=data.service_id,
        starts_at=data.starts_at,
        notes=data.note,
        created_via=BookingCreatedVia.manual,
    )
    return await booking_service.create_booking(db, user, body)


async def replace_master_services(
    db: AsyncSession,
    master_id: UUID,
    rows: list[tuple[UUID, Decimal | None, int | None]],
) -> int:
    await db.execute(delete(MasterService).where(MasterService.master_id == master_id))
    for sid, po, du in rows:
        db.add(
            MasterService(
                master_id=master_id,
                service_id=sid,
                price_override=po,
                duration_override=du,
            )
        )
    await db.flush()
    return len(rows)
