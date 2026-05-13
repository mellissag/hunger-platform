"""CRUD клиентов."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from aiogram import Bot
from aiogram.exceptions import TelegramBadRequest, TelegramForbiddenError
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import Response
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import has_permission
from app.core.salon_role_access import ClientsTabUser, staff_with_clients_tab
from app.deps import get_db, get_redis, get_telegram_bot, require_roles
from app.models.enums import UserRole
from app.models.client import Client as ClientModel
from app.models.user import User
from app.schemas.client import (
    BlacklistEntrySlimOut,
    ClientAIDialogOut,
    ClientBookingHistoryOut,
    ClientBroadcastHistoryOut,
    ClientCreate,
    ClientDetailOut,
    ClientFunnelStatsOut,
    ClientOut,
    ClientReviewOut,
    ClientStatsOut,
    ClientUpdate,
    ResolveTelegramResponse,
    SendMessageRequest,
    SendMessageResponse,
)
from app.schemas.client_note import ClientNoteCreate, ClientNoteOut, ClientNotePinBody, ClientNoteUpdate
from app.schemas.common import PaginatedResponse
from app.services import client_note_service
from app.services import client_service
from app.services.audit_log import record_event
from app.services.bot_booking import is_blacklisted

router = APIRouter(prefix="/clients", tags=["clients"])

STAFF = (UserRole.owner, UserRole.admin, UserRole.reception, UserRole.master)
ADMINS = (UserRole.owner, UserRole.admin)

ClientsCRMUser = Annotated[
    User,
    Depends(staff_with_clients_tab(UserRole.owner, UserRole.admin, UserRole.reception)),
]


async def _admins_clients_dep(
    user: Annotated[User, Depends(require_roles(UserRole.owner, UserRole.admin))],
    db: Annotated[AsyncSession, Depends(get_db)],
    redis: Annotated[Redis | None, Depends(get_redis)],
) -> User:
    from app.core.salon_role_access import assert_salon_clients_tab_access

    await assert_salon_clients_tab_access(user, db, redis)
    return user


AdminsClientsUser = Annotated[User, Depends(_admins_clients_dep)]

_MISSING_LAST_VISIT = object()


def _phone_for_user(c: ClientModel, user: User) -> str | None:
    """Телефон: без права clients.view_phones — не отдаём (null)."""
    raw = c.phone
    if not raw:
        return raw
    if has_permission(user, "clients_view_phones"):
        return raw
    return None


def _to_out(
    c: ClientModel,
    tb: int,
    tr: Decimal,
    *,
    user: User | None = None,
    last_visit_at: datetime | None | object = _MISSING_LAST_VISIT,
) -> ClientOut:
    if last_visit_at is _MISSING_LAST_VISIT:
        eff_lv = c.last_visit_at
    else:
        eff_lv = last_visit_at  # type: ignore[assignment]
    phone = _phone_for_user(c, user) if user is not None else c.phone
    return ClientOut(
        id=c.id,
        tg_user_id=c.tg_user_id,
        tg_username=c.tg_username,
        phone=phone,
        first_name=c.first_name,
        last_name=c.last_name,
        city=c.city,
        birthday=c.birthday,
        lang=c.lang,
        source=c.source,
        joined_at=c.joined_at,
        joined_bot_at=c.joined_bot_at,
        last_bot_activity_at=c.last_bot_activity_at,
        total_bot_sessions=c.total_bot_sessions,
        bot_blocked=c.bot_blocked,
        total_bookings=tb,
        total_revenue=tr,
        no_show_count=c.no_show_count,
        last_visit_at=eff_lv,
        tags=list(c.tags) if c.tags else [],
        created_at=c.created_at,
        updated_at=c.updated_at,
    )


@router.get("/stats", response_model=ClientStatsOut)
async def client_stats(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: ClientsTabUser,
) -> ClientStatsOut:
    total, new_month, avg_ltv = await client_service.client_stats(db, user)
    return ClientStatsOut(total=total, new_month=new_month, avg_ltv=avg_ltv)


@router.get("/export")
async def export_clients(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: ClientsTabUser,
    search: str | None = Query(None),
    q: str | None = Query(None),
    tag: list[str] | None = Query(None),
    tags: str | None = Query(None, description="Comma-separated tags (same as multiple tag=)"),
    master_id: UUID | None = None,
    last_visit_days: str | None = Query(None),
    export_format: str = Query("csv", alias="format", description="csv"),
) -> Response:
    if not has_permission(user, "clients_export"):
        raise HTTPException(status_code=403, detail="clients_export permission required")
    eff = (search or q or "").strip() or None
    tag_params = client_service.normalize_client_tag_filters(tag, tags)
    body = await client_service.export_clients_csv_bytes(
        db,
        user,
        q=eff,
        tags=tag_params,
        master_id=master_id,
        last_visit_days=last_visit_days,
    )
    return Response(
        content=body,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="clients.csv"'},
    )


@router.get("", response_model=PaginatedResponse[ClientOut])
async def list_clients(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: ClientsTabUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500, alias="limit"),
    search: str | None = Query(None),
    q: str | None = Query(None),
    tag: list[str] | None = Query(None),
    tags: str | None = Query(None, description="Comma-separated tags"),
    master_id: UUID | None = None,
    last_visit_days: str | None = Query(None),
) -> PaginatedResponse[ClientOut]:
    eff = (search or q or "").strip() or None
    tag_params = client_service.normalize_client_tag_filters(tag, tags)
    rows, total = await client_service.list_clients(
        db,
        user,
        q=eff,
        page=page,
        page_size=page_size,
        tags=tag_params,
        master_id=master_id,
        last_visit_days=last_visit_days,
    )
    items = [_to_out(c, tb, tr, user=user, last_visit_at=lv) for c, tb, tr, lv in rows]
    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size)


@router.post("", response_model=ClientOut)
async def create_client(
    body: ClientCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: ClientsCRMUser,
) -> ClientOut:
    c = await client_service.create_client(db, user, body)
    return _to_out(c, 0, Decimal(0), user=user)


@router.get("/{client_id}/detail", response_model=ClientDetailOut)
async def get_client_detail(
    client_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: ClientsTabUser,
) -> ClientDetailOut:
    c, tb, tr, lv, notes, bookings_raw, reviews_raw, be = await client_service.get_client_detail(
        db, user, client_id
    )
    base = _to_out(c, tb, tr, user=user, last_visit_at=lv)
    bookings = [
        ClientBookingHistoryOut(
            id=b.id,
            starts_at=b.starts_at,
            ends_at=b.ends_at,
            status=b.status.value,
            price=b.price,
            service_name=svcn,
            master_name=mn,
        )
        for b, svcn, mn in bookings_raw
    ]
    reviews = [
        ClientReviewOut(
            id=r.id,
            rating=r.rating,
            comment=r.comment,
            created_at=r.created_at,
            master_name=mn,
        )
        for r, mn in reviews_raw
    ]
    bl_out: BlacklistEntrySlimOut | None = None
    if be is not None:
        bl_out = BlacklistEntrySlimOut(id=be.id, reason=be.reason, created_at=be.created_at)

    extras = await client_service.client_detail_extras(db, user, client_id, c, tb, tr)

    return ClientDetailOut(
        **base.model_dump(),
        notes=notes,
        bookings=bookings,
        reviews=reviews,
        blacklist_entry=bl_out,
        avg_check=extras["avg_check"],
        favourite_service=extras["favourite_service"],
        favourite_master=extras["favourite_master"],
        funnel_stats=ClientFunnelStatsOut.model_validate(extras["funnel_stats"]),
        bot_language=extras["bot_language"],
        ai_dialogs=[ClientAIDialogOut.model_validate(x) for x in extras["ai_dialogs"]],
        broadcasts=[ClientBroadcastHistoryOut.model_validate(x) for x in extras["broadcasts"]],
    )


@router.get("/{client_id}/broadcasts", response_model=list[ClientBroadcastHistoryOut])
async def list_client_broadcasts(
    client_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: ClientsTabUser,
) -> list[ClientBroadcastHistoryOut]:
    rows = await client_service.list_client_broadcast_history(db, user, client_id)
    return [ClientBroadcastHistoryOut.model_validate(x) for x in rows]


@router.post("/{client_id}/send-message", response_model=SendMessageResponse)
async def send_message_to_client(
    client_id: UUID,
    data: SendMessageRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: AdminsClientsUser,
    bot: Annotated[Bot, Depends(get_telegram_bot)],
) -> SendMessageResponse:
    c, _tb, _tr, _lv = await client_service.get_client(db, user, client_id)
    if not c.tg_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="У клиента нет Telegram ID — сообщение отправить невозможно",
        )
    if await is_blacklisted(db, client_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Клиент в чёрном списке",
        )
    try:
        await bot.send_message(
            chat_id=int(c.tg_user_id),
            text=data.text,
            parse_mode=data.parse_mode or None,
        )
    except TelegramForbiddenError:
        c.bot_blocked = True
        await db.flush()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Клиент заблокировал бота — отправка невозможна",
        ) from None
    except TelegramBadRequest as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Ошибка Telegram: {e}",
        ) from e

    c.bot_blocked = False
    await db.flush()

    await record_event(
        db,
        user_id=user.id,
        action="client_message_sent",
        entity_type="client",
        entity_id=client_id,
        payload={"text_preview": data.text[:100]},
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    return SendMessageResponse(ok=True, message="Сообщение отправлено")


@router.post("/{client_id}/resolve-telegram", response_model=ResolveTelegramResponse)
async def resolve_telegram(
    client_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: AdminsClientsUser,
    bot: Annotated[Bot, Depends(get_telegram_bot)],
) -> ResolveTelegramResponse:
    c, _tb, _tr, _lv = await client_service.get_client(db, user, client_id)
    if not c.tg_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="tg_user_id неизвестен — клиент не писал боту",
        )
    try:
        tg_user = await bot.get_chat(int(c.tg_user_id))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Не удалось получить данные: {e!s}",
        ) from e

    updated: dict[str, str] = {}
    if getattr(tg_user, "username", None) and not c.tg_username:
        c.tg_username = str(tg_user.username)
        updated["tg_username"] = c.tg_username
    fn = getattr(tg_user, "first_name", None)
    if fn and not c.first_name:
        c.first_name = str(fn)
        updated["first_name"] = c.first_name
    await db.flush()
    return ResolveTelegramResponse(ok=True, updated=updated)


@router.get("/{client_id}", response_model=ClientOut)
async def get_client(
    client_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: ClientsTabUser,
) -> ClientOut:
    c, tb, tr, lv = await client_service.get_client(db, user, client_id)
    return _to_out(c, tb, tr, user=user, last_visit_at=lv)


@router.patch("/{client_id}", response_model=ClientOut)
@router.put("/{client_id}", response_model=ClientOut)
async def update_client(
    client_id: UUID,
    body: ClientUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: ClientsTabUser,
) -> ClientOut:
    await client_service.update_client(db, user, client_id, body)
    c, tb, tr, lv = await client_service.get_client(db, user, client_id)
    return _to_out(c, tb, tr, user=user, last_visit_at=lv)


@router.delete("/{client_id}", status_code=204)
async def delete_client(
    client_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: ClientsCRMUser,
) -> None:
    await client_service.delete_client(db, user, client_id)


@router.get("/{client_id}/notes", response_model=list[ClientNoteOut])
async def list_client_notes(
    client_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: ClientsTabUser,
) -> list[ClientNoteOut]:
    return await client_note_service.list_notes(db, user, client_id)


@router.post("/{client_id}/notes", response_model=ClientNoteOut)
async def create_client_note(
    client_id: UUID,
    body: ClientNoteCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: ClientsTabUser,
) -> ClientNoteOut:
    return await client_note_service.create_note(
        db, user, client_id, body.content, pinned=body.pinned
    )


@router.patch("/{client_id}/notes/{note_id}", response_model=ClientNoteOut)
async def update_client_note(
    client_id: UUID,
    note_id: UUID,
    body: ClientNoteUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: ClientsTabUser,
) -> ClientNoteOut:
    return await client_note_service.update_note(db, user, client_id, note_id, body.content)


@router.delete("/{client_id}/notes/{note_id}", status_code=204)
async def delete_client_note(
    client_id: UUID,
    note_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: ClientsTabUser,
) -> None:
    await client_note_service.delete_note(db, user, client_id, note_id)


@router.post("/{client_id}/notes/{note_id}/pin", response_model=ClientNoteOut)
async def pin_client_note(
    client_id: UUID,
    note_id: UUID,
    body: ClientNotePinBody,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: ClientsCRMUser,
) -> ClientNoteOut:
    return await client_note_service.set_pinned(db, user, client_id, note_id, body.pinned)
