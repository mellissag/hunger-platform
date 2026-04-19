"""Ограничение выборок по роли (master — только свои сущности)."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import ColumnElement, false, literal, select

from app.models.booking import Booking
from app.models.client import Client
from app.models.enums import UserRole
from app.models.master import Master
from app.models.user import User


def booking_scope_filter(user: User) -> ColumnElement[bool]:
    """Фильтр по бронированиям: мастер видит только свои строки."""
    if user.role != UserRole.master:
        return literal(True)
    mid = user.master_id
    if mid is None:
        return false()
    return Booking.master_id == mid


def client_scope_filter(user: User) -> ColumnElement[bool]:
    """Клиенты, с которыми мастер имел записи; остальные роли — без ограничения."""
    if user.role != UserRole.master:
        return literal(True)
    mid = user.master_id
    if mid is None:
        return false()
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
