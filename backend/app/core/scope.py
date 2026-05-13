"""Ограничение выборок по роли (master — только свои сущности)."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import ColumnElement, false, literal, select

from app.core.user_page_permissions import page_perm
from app.models.booking import Booking
from app.models.client import Client
from app.models.enums import UserRole
from app.models.master import Master
from app.models.user import User


def booking_scope_filter(user: User) -> ColumnElement[bool]:
    """Мастер: все брони салона или только свои — по праву bookings.view_all."""
    if user.role != UserRole.master:
        return literal(True)
    mid = user.master_id
    if mid is None:
        return false()
    if page_perm(user, "bookings", "view_all"):
        return literal(True)
    return Booking.master_id == mid


def client_scope_filter(user: User) -> ColumnElement[bool]:
    """Мастер: все клиенты или только со своими записями — по праву clients.view_all."""
    if user.role != UserRole.master:
        return literal(True)
    mid = user.master_id
    if mid is None:
        return false()
    if page_perm(user, "clients", "view_all"):
        return literal(True)
    return Client.id.in_(select(Booking.client_id).where(Booking.master_id == mid).distinct())


def master_record_scope_filter(user: User) -> ColumnElement[bool]:
    """Список мастеров: мастер-роль видит только свою карточку."""
    if user.role != UserRole.master:
        return literal(True)
    mid = user.master_id
    if mid is None:
        return false()
    return Master.id == mid


def ensure_master_can_access_booking(user: User, booking_master_id: UUID) -> None:
    from app.core.exceptions import ForbiddenScopeError

    if user.role != UserRole.master or user.master_id is None:
        return
    if user.master_id != booking_master_id:
        raise ForbiddenScopeError()


def ensure_master_own_master_id(user: User, master_id: UUID) -> None:
    from app.core.exceptions import ForbiddenScopeError

    if user.role != UserRole.master or user.master_id is None:
        return
    if user.master_id != master_id:
        raise ForbiddenScopeError()
