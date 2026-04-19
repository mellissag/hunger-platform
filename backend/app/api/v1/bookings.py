"""Бронирования."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, require_roles
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.booking import (
    BookingCancel,
    BookingCreate,
    BookingOut,
    BookingReschedule,
    BookingUpdate,
)
from app.schemas.common import PaginatedResponse
from app.services import booking_service

router = APIRouter(prefix="/bookings", tags=["bookings"])

STAFF = (UserRole.owner, UserRole.admin, UserRole.reception, UserRole.master)


@router.get("", response_model=PaginatedResponse[BookingOut])
async def list_bookings(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*STAFF))],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    q: str | None = None,
) -> PaginatedResponse[BookingOut]:
    rows, total = await booking_service.list_bookings(db, user, q=q, page=page, page_size=page_size)
    return PaginatedResponse(
        items=[BookingOut.model_validate(b) for b in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/{booking_id}/cancel", response_model=BookingOut)
async def cancel_booking(
    booking_id: UUID,
    body: BookingCancel,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*STAFF))],
) -> BookingOut:
    b = await booking_service.cancel_booking(
        db, user, booking_id, actor=body.actor, reason=body.reason
    )
    return BookingOut.model_validate(b)


@router.post("/{booking_id}/reschedule", response_model=BookingOut)
async def reschedule_booking(
    booking_id: UUID,
    body: BookingReschedule,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*STAFF))],
) -> BookingOut:
    b = await booking_service.reschedule_booking(db, user, booking_id, body.starts_at)
    return BookingOut.model_validate(b)


@router.post("/{booking_id}/complete", response_model=BookingOut)
async def complete_booking(
    booking_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*STAFF))],
) -> BookingOut:
    b = await booking_service.mark_completed(db, user, booking_id)
    return BookingOut.model_validate(b)


@router.post("/{booking_id}/no-show", response_model=BookingOut)
async def no_show_booking(
    booking_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*STAFF))],
) -> BookingOut:
    b = await booking_service.mark_no_show(db, user, booking_id)
    return BookingOut.model_validate(b)


@router.get("/{booking_id}", response_model=BookingOut)
async def get_booking(
    booking_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*STAFF))],
) -> BookingOut:
    b = await booking_service.get_booking(db, user, booking_id)
    return BookingOut.model_validate(b)


@router.post("", response_model=BookingOut)
async def create_booking(
    body: BookingCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*STAFF))],
) -> BookingOut:
    b = await booking_service.create_booking(db, user, body)
    return BookingOut.model_validate(b)


@router.patch("/{booking_id}", response_model=BookingOut)
async def update_booking(
    booking_id: UUID,
    body: BookingUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*STAFF))],
) -> BookingOut:
    b = await booking_service.update_booking(db, user, booking_id, body)
    return BookingOut.model_validate(b)


@router.delete("/{booking_id}", status_code=204)
async def delete_booking(
    booking_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*STAFF))],
) -> None:
    await booking_service.delete_booking(db, user, booking_id)
