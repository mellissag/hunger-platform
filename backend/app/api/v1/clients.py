"""CRUD клиентов."""

from __future__ import annotations

from decimal import Decimal
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, require_roles
from app.models.enums import UserRole
from app.models.client import Client as ClientModel
from app.models.user import User
from app.schemas.client import ClientCreate, ClientOut, ClientUpdate
from app.schemas.client_note import ClientNoteCreate, ClientNoteOut, ClientNotePinBody, ClientNoteUpdate
from app.schemas.common import PaginatedResponse
from app.services import client_service
from app.services import client_note_service

router = APIRouter(prefix="/clients", tags=["clients"])

STAFF = (UserRole.owner, UserRole.admin, UserRole.reception, UserRole.master)


def _to_out(c: ClientModel, tb: int, tr: Decimal) -> ClientOut:
    return ClientOut(
        id=c.id,
        tg_user_id=c.tg_user_id,
        tg_username=c.tg_username,
        phone=c.phone,
        first_name=c.first_name,
        last_name=c.last_name,
        birthday=c.birthday,
        lang=c.lang,
        source=c.source,
        joined_at=c.joined_at,
        total_bookings=tb,
        total_revenue=tr,
        no_show_count=c.no_show_count,
        last_visit_at=c.last_visit_at,
        tags=list(c.tags) if c.tags else [],
        created_at=c.created_at,
        updated_at=c.updated_at,
    )


@router.get("", response_model=PaginatedResponse[ClientOut])
async def list_clients(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*STAFF))],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    q: str | None = Query(None, description="Поиск по имени/телефону/@"),
) -> PaginatedResponse[ClientOut]:
    rows, total = await client_service.list_clients(db, user, q=q, page=page, page_size=page_size)
    items = [_to_out(c, tb, tr) for c, tb, tr in rows]
    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/{client_id}", response_model=ClientOut)
async def get_client(
    client_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*STAFF))],
) -> ClientOut:
    c, tb, tr = await client_service.get_client(db, user, client_id)
    return _to_out(c, tb, tr)


@router.post("", response_model=ClientOut)
async def create_client(
    body: ClientCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.owner, UserRole.admin, UserRole.reception))],
) -> ClientOut:
    c = await client_service.create_client(db, user, body)
    return _to_out(c, 0, Decimal(0))


@router.patch("/{client_id}", response_model=ClientOut)
async def update_client(
    client_id: UUID,
    body: ClientUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*STAFF))],
) -> ClientOut:
    await client_service.update_client(db, user, client_id, body)
    c, tb, tr = await client_service.get_client(db, user, client_id)
    return _to_out(c, tb, tr)


@router.delete("/{client_id}", status_code=204)
async def delete_client(
    client_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.owner, UserRole.admin, UserRole.reception))],
) -> None:
    await client_service.delete_client(db, user, client_id)


@router.get("/{client_id}/notes", response_model=list[ClientNoteOut])
async def list_client_notes(
    client_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*STAFF))],
) -> list[ClientNoteOut]:
    return await client_note_service.list_notes(db, user, client_id)


@router.post("/{client_id}/notes", response_model=ClientNoteOut)
async def create_client_note(
    client_id: UUID,
    body: ClientNoteCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*STAFF))],
) -> ClientNoteOut:
    return await client_note_service.create_note(db, user, client_id, body.content)


@router.patch("/{client_id}/notes/{note_id}", response_model=ClientNoteOut)
async def update_client_note(
    client_id: UUID,
    note_id: UUID,
    body: ClientNoteUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*STAFF))],
) -> ClientNoteOut:
    return await client_note_service.update_note(db, user, client_id, note_id, body.content)


@router.delete("/{client_id}/notes/{note_id}", status_code=204)
async def delete_client_note(
    client_id: UUID,
    note_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*STAFF))],
) -> None:
    await client_note_service.delete_note(db, user, client_id, note_id)


@router.post("/{client_id}/notes/{note_id}/pin", response_model=ClientNoteOut)
async def pin_client_note(
    client_id: UUID,
    note_id: UUID,
    body: ClientNotePinBody,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.owner, UserRole.admin, UserRole.reception))],
) -> ClientNoteOut:
    return await client_note_service.set_pinned(db, user, client_id, note_id, body.pinned)
