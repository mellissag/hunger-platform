"""CRUD рассылок и запуск отправки."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, require_roles
from app.models.broadcast import Broadcast
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.broadcast import (
    BroadcastCreate,
    BroadcastOut,
    BroadcastSendBody,
    BroadcastUpdate,
)
from app.schemas.common import PaginatedResponse
from app.services import broadcast_service

router = APIRouter(prefix="/broadcasts", tags=["broadcasts"])

STAFF = (UserRole.owner, UserRole.admin)


def _to_out(bc: Broadcast) -> BroadcastOut:
    return BroadcastOut(
        id=bc.id,
        title=bc.title,
        message_i18n=dict(bc.message_i18n or {}),
        segment=dict(bc.segment or {}),
        media_url=bc.media_url,
        media_type=bc.media_type,
        inline_keyboard=dict(bc.inline_keyboard) if bc.inline_keyboard else None,
        status=bc.status,
        scheduled_at=bc.scheduled_at,
        sent_at=bc.sent_at,
        stats=dict(bc.stats or {}),
        created_by_user_id=bc.created_by_user_id,
        created_at=bc.created_at,
        updated_at=bc.updated_at,
    )


@router.get("", response_model=PaginatedResponse[BroadcastOut])
async def list_broadcasts(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*STAFF))],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> PaginatedResponse[BroadcastOut]:
    rows, total = await broadcast_service.list_broadcasts(db, page=page, page_size=page_size)
    return PaginatedResponse(
        items=[_to_out(b) for b in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=BroadcastOut)
async def create_broadcast(
    body: BroadcastCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*STAFF))],
) -> BroadcastOut:
    try:
        bc = await broadcast_service.create_broadcast(db, user, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return _to_out(bc)


@router.get("/{broadcast_id}", response_model=BroadcastOut)
async def get_broadcast(
    broadcast_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*STAFF))],
) -> BroadcastOut:
    from app.core.exceptions import NotFoundError

    try:
        bc = await broadcast_service.get_broadcast(db, broadcast_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=e.message) from e
    return _to_out(bc)


@router.patch("/{broadcast_id}", response_model=BroadcastOut)
async def update_broadcast(
    broadcast_id: UUID,
    body: BroadcastUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*STAFF))],
) -> BroadcastOut:
    from app.core.exceptions import BroadcastInvalidStateError, NotFoundError

    try:
        bc = await broadcast_service.update_broadcast(db, broadcast_id, body)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=e.message) from e
    except BroadcastInvalidStateError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return _to_out(bc)


@router.delete("/{broadcast_id}", status_code=204)
async def delete_broadcast(
    broadcast_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*STAFF))],
) -> None:
    from app.core.exceptions import BroadcastInvalidStateError, NotFoundError

    try:
        await broadcast_service.delete_broadcast(db, broadcast_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=e.message) from e
    except BroadcastInvalidStateError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message) from e


@router.post("/{broadcast_id}/send", response_model=BroadcastOut)
async def send_broadcast(
    broadcast_id: UUID,
    body: BroadcastSendBody,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*STAFF))],
) -> BroadcastOut:
    from app.core.exceptions import (
        BroadcastInvalidStateError,
        EmptySegmentError,
        NotFoundError,
    )

    try:
        bc = await broadcast_service.publish_and_enqueue(db, broadcast_id, body)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=e.message) from e
    except BroadcastInvalidStateError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message) from e
    except EmptySegmentError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return _to_out(bc)
