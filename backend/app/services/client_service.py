"""Клиенты: CRUD + агрегаты подзапросами."""

from __future__ import annotations

import csv
import io
import logging
from typing import Any

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import UUID

import app.core.clock as clock
from sqlalchemy import delete as sql_delete
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, ForbiddenScopeError, NotFoundError, UnprocessableClientError
from app.core.scope import client_scope_filter
from app.models.ai_chat import AIConversation, AIMessage
from app.models.booking import BlacklistEntry, Booking, Review
from app.models.broadcast import Broadcast, BroadcastRecipient
from app.models.catalog import Service
from app.models.client import Client
from app.models.enums import AIMessageRole, BookingStatus, UserRole
from app.models.master import Master
from app.models.user import User
from app.schemas.client import ClientCreate, ClientUpdate

logger = logging.getLogger(__name__)


def _norm_optional_str(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped if stripped else None


def _norm_tg_username(value: str | None) -> str | None:
    raw = _norm_optional_str(value)
    if raw is None:
        return None
    return raw.lstrip("@")


def _is_pg_unique_violation(exc: IntegrityError) -> bool:
    orig = getattr(exc, "orig", None)
    if orig is not None:
        code = getattr(orig, "sqlstate", None) or getattr(orig, "pgcode", None)
        if code == "23505":
            return True
    lowered = str(exc).lower()
    return "uniqueviolation" in lowered.replace(" ", "") or "duplicate key" in lowered


def normalize_client_tag_filters(
    tag: list[str] | None,
    tags: str | None,
) -> list[str] | None:
    merged: list[str] = []
    if tag:
        merged.extend(t.strip() for t in tag if t and str(t).strip())
    if tags:
        merged.extend(t.strip() for t in str(tags).split(",") if t.strip())
    if not merged:
        return None
    out: list[str] = []
    seen: set[str] = set()
    for t in merged:
        if t not in seen:
            seen.add(t)
            out.append(t)
    return out


def _merge_last_visit_dates(
    stored: datetime | None,
    computed_from_bookings: datetime | None,
) -> datetime | None:
    """Берём более позднюю из даты в профиле и фактического max(starts_at) по записям."""
    candidates = [d for d in (stored, computed_from_bookings) if d is not None]
    return max(candidates) if candidates else None


def _last_visit_from_bookings_sq(now: datetime) -> Any:
    """MAX(starts_at) по прошедшим броням (не отменённым)."""
    cancelled = (
        BookingStatus.cancelled_by_client,
        BookingStatus.cancelled_by_salon,
    )
    return (
        select(func.max(Booking.starts_at))
        .where(
            Booking.client_id == Client.id,
            Booking.starts_at.is_not(None),
            Booking.starts_at <= now,
            Booking.status.not_in(cancelled),
        )
        .correlate(Client)
        .scalar_subquery()
    )


def _agg_subqueries() -> tuple[Any, Any]:
    tb = (
        select(func.count(Booking.id))
        .where(Booking.client_id == Client.id)
        .correlate(Client)
        .scalar_subquery()
    )
    tr = (
        select(func.coalesce(func.sum(Booking.price), 0))
        .where(
            Booking.client_id == Client.id,
            Booking.status == BookingStatus.completed,
        )
        .correlate(Client)
        .scalar_subquery()
    )
    return tb, tr


def _list_client_filters(
    user: User,
    *,
    q: str | None,
    tags: list[str] | None,
    master_id: UUID | None,
    last_visit_days: str | None,
) -> list[Any]:
    filters: list[Any] = [client_scope_filter(user)]
    search = (q or "").strip()
    if search:
        pattern = f"%{search}%"
        filters.append(
            or_(
                Client.first_name.ilike(pattern),
                Client.last_name.ilike(pattern),
                Client.phone.ilike(pattern),
                Client.tg_username.ilike(pattern),
            )
        )
    if tags:
        tag_list = [t.strip() for t in tags if t.strip()]
        if tag_list:
            filters.append(Client.tags.overlap(tag_list))
    if master_id is not None:
        filters.append(
            Client.id.in_(select(Booking.client_id).where(Booking.master_id == master_id).distinct())
        )
    now = clock.utc_now()
    lv_sq = _last_visit_from_bookings_sq(now)
    lv = (last_visit_days or "").strip()
    if lv == "7":
        filters.append(lv_sq.is_not(None))
        filters.append(lv_sq >= now - timedelta(days=7))
    elif lv == "30":
        filters.append(lv_sq.is_not(None))
        filters.append(lv_sq >= now - timedelta(days=30))
    elif lv == "90":
        filters.append(lv_sq.is_not(None))
        filters.append(lv_sq >= now - timedelta(days=90))
    elif lv == "180+":
        filters.append(or_(lv_sq.is_(None), lv_sq < now - timedelta(days=180)))
    return filters


async def list_clients(
    db: AsyncSession,
    user: User,
    *,
    q: str | None,
    page: int,
    page_size: int,
    tags: list[str] | None = None,
    master_id: UUID | None = None,
    last_visit_days: str | None = None,
) -> tuple[list[tuple[Client, int, Decimal, datetime | None]], int]:
    tb, tr = _agg_subqueries()
    now = clock.utc_now()
    lv_sq = _last_visit_from_bookings_sq(now)
    filters = _list_client_filters(
        user, q=q, tags=tags, master_id=master_id, last_visit_days=last_visit_days
    )
    count_stmt = select(func.count(Client.id)).where(*filters)
    total = int((await db.execute(count_stmt)).scalar_one())

    stmt = (
        select(Client, tb.label("total_bookings"), tr.label("total_revenue"), lv_sq.label("lv_bookings"))
        .where(*filters)
        .order_by(Client.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await db.execute(stmt)).all()
    out: list[tuple[Client, int, Decimal, datetime | None]] = []
    for row in rows:
        c = row[0]
        lv_raw = row.lv_bookings
        lv_merged = _merge_last_visit_dates(c.last_visit_at, lv_raw)
        out.append((c, int(row.total_bookings or 0), Decimal(row.total_revenue or 0), lv_merged))
    return out, total


async def client_stats(db: AsyncSession, user: User) -> tuple[int, int, float]:
    scope = client_scope_filter(user)
    total = int((await db.execute(select(func.count(Client.id)).where(scope))).scalar_one() or 0)
    now = clock.utc_now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    new_month = int(
        (
            await db.execute(
                select(func.count(Client.id)).where(scope).where(Client.joined_at >= month_start)
            )
        ).scalar_one()
        or 0
    )
    sub = (
        select(Booking.client_id, func.coalesce(func.sum(Booking.price), 0).label("rev"))
        .where(Booking.status == BookingStatus.completed)
        .group_by(Booking.client_id)
    ).subquery()
    avg_ltv = (
        await db.execute(
            select(func.coalesce(func.avg(sub.c.rev), 0))
            .select_from(sub)
            .join(Client, Client.id == sub.c.client_id)
            .where(scope)
        )
    ).scalar_one()
    return total, new_month, float(avg_ltv or 0)


def _service_name_from_i18n(name_i18n: object | None) -> str | None:
    if not name_i18n or not isinstance(name_i18n, dict):
        return None
    d = dict(name_i18n)
    if not d:
        return None
    return str(d.get("en") or next(iter(d.values())))


def _service_name(svc: Service) -> str:
    return _service_name_from_i18n(svc.name_i18n) or ""


async def get_client_detail(
    db: AsyncSession,
    user: User,
    client_id: UUID,
) -> tuple[Client, int, Decimal, datetime | None, list, list, list, BlacklistEntry | None]:
    """Заметки, история броней, отзывы, блэклист."""
    from app.services import client_note_service

    c, tb, tr, lv = await get_client(db, user, client_id)
    notes = await client_note_service.list_notes(db, user, client_id)

    # master_id may be NULL — INNER JOIN Master dropped rows and could confuse loaders;
    # use OUTER JOIN and tolerate missing master for display.
    b_stmt = (
        select(Booking, Service, Master)
        .join(Service, Service.id == Booking.service_id)
        .outerjoin(Master, Master.id == Booking.master_id)
        .where(Booking.client_id == client_id)
        .order_by(Booking.starts_at.desc())
        .limit(5)
    )
    if user.role == UserRole.master and user.master_id is not None:
        b_stmt = b_stmt.where(Booking.master_id == user.master_id)
    brows = (await db.execute(b_stmt)).all()
    bookings_out: list[tuple[Booking, str, str]] = []
    for b, svc, m in brows:
        mn = (m.display_name if m is not None else "") or "—"
        bookings_out.append((b, _service_name(svc), mn))

    r_stmt = (
        select(Review, Master)
        .join(Master, Master.id == Review.master_id)
        .where(Review.client_id == client_id, Review.is_visible.is_(True))
        .order_by(Review.created_at.desc())
    )
    rrows = (await db.execute(r_stmt)).all()
    reviews_out: list[tuple[Review, str]] = [(r, m.display_name) for r, m in rrows]

    be = (
        await db.execute(select(BlacklistEntry).where(BlacklistEntry.client_id == client_id).limit(1))
    ).scalars().first()

    return c, tb, tr, lv, notes, bookings_out, reviews_out, be


async def client_detail_extras(
    db: AsyncSession,
    user: User,
    client_id: UUID,
    client: Client,
    total_bookings: int,
    total_revenue: Decimal,
) -> dict[str, Any]:
    """Доп. поля для карточки клиента (воронка, AI, рассылки, фавориты)."""
    try:
        return await _client_detail_extras_compute(
            db, user, client_id, client, total_bookings, total_revenue
        )
    except Exception:
        logger.exception("client_detail_extras failed for client_id=%s", client_id)
        return _client_detail_extras_fallback(client, total_bookings, total_revenue)


def _client_detail_extras_fallback(
    client: Client,
    total_bookings: int,
    total_revenue: Decimal,
) -> dict[str, Any]:
    raw_fs = client.funnel_stats if isinstance(client.funnel_stats, dict) else {}
    started = int(raw_fs.get("started_booking") or 0)
    completed = int(raw_fs.get("completed_booking") or 0)
    avg_check = (total_revenue / Decimal(total_bookings)) if total_bookings else Decimal(0)
    return {
        "avg_check": avg_check,
        "favourite_service": None,
        "favourite_master": None,
        "funnel_stats": {
            "started_booking": started,
            "completed_booking": completed,
            "abandoned_booking": max(0, started - completed),
            "ai_sessions": int(raw_fs.get("ai_sessions") or 0),
        },
        "ai_dialogs": [],
        "broadcasts": [],
        "bot_language": client.lang or "en",
    }


async def _client_detail_extras_compute(
    db: AsyncSession,
    user: User,
    client_id: UUID,
    client: Client,
    total_bookings: int,
    total_revenue: Decimal,
) -> dict[str, Any]:
    master_scope = user.master_id if user.role == UserRole.master else None
    b_where: list[Any] = [
        Booking.client_id == client_id,
        Booking.status == BookingStatus.completed,
    ]
    if master_scope is not None:
        b_where.append(Booking.master_id == master_scope)

    fav_svc_row = (
        await db.execute(
            select(Service.name_i18n, func.count().label("cnt"))
            .select_from(Booking)
            .join(Service, Service.id == Booking.service_id)
            .where(*b_where)
            .group_by(Service.id)
            .order_by(func.count().desc())
            .limit(1)
        )
    ).first()
    fav_master_row = (
        await db.execute(
            select(Master.display_name, func.count().label("cnt"))
            .select_from(Booking)
            .join(Master, Master.id == Booking.master_id)
            .where(*b_where)
            .group_by(Master.id)
            .order_by(func.count().desc())
            .limit(1)
        )
    ).first()

    favourite_service = _service_name_from_i18n(fav_svc_row[0]) if fav_svc_row else None
    favourite_master = str(fav_master_row[0]) if fav_master_row and fav_master_row[0] else None

    avg_check = (total_revenue / Decimal(total_bookings)) if total_bookings else Decimal(0)

    raw_fs = client.funnel_stats if isinstance(client.funnel_stats, dict) else {}
    started = int(raw_fs.get("started_booking") or 0)
    completed = int(raw_fs.get("completed_booking") or 0)
    abandoned = max(0, started - completed)
    funnel_stats = {
        "started_booking": started,
        "completed_booking": completed,
        "abandoned_booking": abandoned,
        "ai_sessions": int(raw_fs.get("ai_sessions") or 0),
    }

    convs = (
        (
            await db.execute(
                select(AIConversation)
                .where(AIConversation.client_id == client_id)
                .order_by(AIConversation.started_at.desc())
                .limit(12)
            )
        )
        .scalars()
        .all()
    )
    ai_dialogs: list[dict[str, Any]] = []
    for conv in convs:
        preview_msg = (
            await db.execute(
                select(AIMessage)
                .where(
                    AIMessage.conversation_id == conv.id,
                    AIMessage.role == AIMessageRole.user,
                )
                .order_by(AIMessage.created_at.asc())
                .limit(1)
            )
        ).scalars().first()
        preview: str | None = None
        if preview_msg and preview_msg.content:
            text = preview_msg.content.strip()
            preview = text if len(text) <= 160 else text[:160] + "…"
        ai_dialogs.append(
            {
                "id": conv.id,
                "started_at": conv.started_at,
                "preview": preview,
            }
        )

    bcast_rows = (
        await db.execute(
            select(Broadcast.id, Broadcast.title, BroadcastRecipient.status, BroadcastRecipient.sent_at)
            .join(BroadcastRecipient, BroadcastRecipient.broadcast_id == Broadcast.id)
            .where(BroadcastRecipient.client_id == client_id)
            .order_by(BroadcastRecipient.sent_at.desc())
            .limit(50)
        )
    ).all()
    broadcasts = [
        {
            "broadcast_id": bid,
            "broadcast_title": (title or ""),
            "status": st.value if hasattr(st, "value") else str(st),
            "sent_at": sent_at,
        }
        for bid, title, st, sent_at in bcast_rows
    ]

    return {
        "avg_check": avg_check,
        "favourite_service": favourite_service,
        "favourite_master": favourite_master,
        "funnel_stats": funnel_stats,
        "ai_dialogs": ai_dialogs,
        "broadcasts": broadcasts,
        "bot_language": client.lang or "en",
    }


async def list_client_broadcast_history(
    db: AsyncSession,
    user: User,
    client_id: UUID,
) -> list[dict[str, Any]]:
    await get_client(db, user, client_id)
    rows = (
        await db.execute(
            select(Broadcast.id, Broadcast.title, BroadcastRecipient.status, BroadcastRecipient.sent_at)
            .join(BroadcastRecipient, BroadcastRecipient.broadcast_id == Broadcast.id)
            .where(BroadcastRecipient.client_id == client_id)
            .order_by(BroadcastRecipient.sent_at.desc())
            .limit(100)
        )
    ).all()
    return [
        {
            "broadcast_id": bid,
            "broadcast_title": title,
            "status": st.value if hasattr(st, "value") else str(st),
            "sent_at": sent_at,
        }
        for bid, title, st, sent_at in rows
    ]


async def export_clients_csv_bytes(
    db: AsyncSession,
    user: User,
    *,
    q: str | None,
    tags: list[str] | None,
    master_id: UUID | None,
    last_visit_days: str | None,
) -> bytes:
    tb, tr = _agg_subqueries()
    now = clock.utc_now()
    lv_sq = _last_visit_from_bookings_sq(now)
    filters = _list_client_filters(
        user, q=q, tags=tags, master_id=master_id, last_visit_days=last_visit_days
    )
    stmt = (
        select(Client, tb.label("total_bookings"), tr.label("total_revenue"), lv_sq.label("lv_bookings"))
        .where(*filters)
        .order_by(Client.created_at.desc())
        .limit(10_000)
    )
    rows = (await db.execute(stmt)).all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(
        [
            "id",
            "first_name",
            "last_name",
            "phone",
            "tg_username",
            "tags",
            "total_bookings",
            "total_revenue",
            "last_visit_at",
            "joined_at",
        ]
    )
    for row in rows:
        cl = row[0]
        lv_out = _merge_last_visit_dates(cl.last_visit_at, row.lv_bookings)
        w.writerow(
            [
                str(cl.id),
                cl.first_name or "",
                cl.last_name or "",
                cl.phone or "",
                cl.tg_username or "",
                ",".join(cl.tags or []),
                int(row.total_bookings or 0),
                str(row.total_revenue or 0),
                lv_out.isoformat() if lv_out else "",
                cl.joined_at.isoformat(),
            ]
        )
    return buf.getvalue().encode("utf-8-sig")


async def get_client(
    db: AsyncSession, user: User, client_id: UUID
) -> tuple[Client, int, Decimal, datetime | None]:
    tb, tr = _agg_subqueries()
    now = clock.utc_now()
    lv_sq = _last_visit_from_bookings_sq(now)
    stmt = (
        select(Client, tb.label("total_bookings"), tr.label("total_revenue"), lv_sq.label("lv_bookings"))
        .where(Client.id == client_id)
        .where(client_scope_filter(user))
    )
    row = (await db.execute(stmt)).one_or_none()
    if row is None:
        raise NotFoundError("Client not found")
    c = row[0]
    lv_merged = _merge_last_visit_dates(c.last_visit_at, row.lv_bookings)
    return (
        c,
        int(row.total_bookings or 0),
        Decimal(row.total_revenue or 0),
        lv_merged,
    )


async def create_client(db: AsyncSession, user: User, data: ClientCreate) -> Client:
    if user.role == UserRole.master:
        raise ForbiddenScopeError("Masters cannot create clients via API")
    phone = _norm_optional_str(data.phone)
    tg_username = _norm_tg_username(data.tg_username)
    c = Client(
        tg_user_id=data.tg_user_id,
        tg_username=tg_username,
        phone=phone,
        first_name=data.first_name,
        last_name=data.last_name,
        city=data.city,
        birthday=data.birthday,
        lang=data.lang,
        source=data.source,
        tags=data.tags,
    )
    db.add(c)
    try:
        await db.flush()
    except IntegrityError as e:
        if _is_pg_unique_violation(e):
            raise ConflictError(
                "Клиент с таким телефоном, Telegram или другим уникальным полем уже есть в базе. "
                "Найдите его в списке клиентов или измените данные.",
                code="client_duplicate",
            ) from e
        logger.warning("client create: non-unique integrity error", exc_info=True)
        raise UnprocessableClientError(
            "Не удалось сохранить клиента: база отклонила данные (не обязательно дубликат). "
            "Проверьте телефон (достаточно цифр, можно с + или без), Telegram и дату рождения; "
            "попробуйте временно очистить Telegram. Если не помогает — откройте «Клиенты» и поищите по телефону."
        ) from e
    await db.refresh(c)
    return c


async def update_client(db: AsyncSession, user: User, client_id: UUID, data: ClientUpdate) -> Client:
    row = await db.get(Client, client_id)
    if row is None:
        raise NotFoundError("Client not found")
    if user.role == UserRole.master:
        if user.master_id is None:
            raise ForbiddenScopeError()
        from sqlalchemy import and_, exists

        ok = await db.scalar(
            select(
                exists(
                    select(1)
                    .select_from(Booking)
                    .where(
                        and_(
                            Booking.client_id == client_id,
                            Booking.master_id == user.master_id,
                        )
                    )
                )
            )
        )
        if not ok:
            raise ForbiddenScopeError()
    payload = data.model_dump(exclude_unset=True)
    if "tg_username" in payload and payload["tg_username"] is not None:
        raw = str(payload["tg_username"]).strip().lstrip("@")
        payload["tg_username"] = raw or None
    for k, v in payload.items():
        setattr(row, k, v)
    row.updated_at = datetime.now(tz=UTC)
    await db.flush()
    return row


async def delete_client(db: AsyncSession, user: User, client_id: UUID) -> None:
    if user.role == UserRole.master:
        raise ForbiddenScopeError("Masters cannot delete clients")
    row, _tb, _tr, _lv = await get_client(db, user, client_id)
    # booking.client_id uses ON DELETE RESTRICT — delete bookings first.
    await db.execute(sql_delete(Booking).where(Booking.client_id == client_id))
    await db.flush()
    try:
        await db.delete(row)
        await db.flush()
    except IntegrityError as e:
        raise ConflictError("Client has related records", code="client_has_bookings") from e
