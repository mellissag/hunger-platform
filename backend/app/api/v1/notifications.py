"""Уведомления для колокольчика в топбаре."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, require_roles
from app.models.booking import Booking
from app.models.catalog import Service
from app.models.client import Client
from app.models.enums import BookingStatus, UserRole
from app.models.user import User

router = APIRouter(prefix="/notifications", tags=["notifications"])

STAFF = (UserRole.owner, UserRole.admin, UserRole.reception)


class NotificationItem(BaseModel):
    id: str
    type: str
    title: str
    body: str
    color: str
    created_at: str
    booking_id: str


class NotificationsResponse(BaseModel):
    items: list[NotificationItem]
    total: int


def _client_name(c: Client | None) -> str:
    if not c:
        return "—"
    return " ".join(x for x in (c.first_name or "", c.last_name or "") if x).strip() or "—"


def _svc_name(svc: Service | None) -> str:
    if not svc:
        return "—"
    ni = svc.name_i18n if isinstance(svc.name_i18n, dict) else {}
    return str(ni.get("ru") or ni.get("en") or "—")


@router.get("", response_model=NotificationsResponse)
async def get_notifications(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*STAFF))],
    limit: int = Query(15, ge=1, le=50),
) -> NotificationsResponse:
    stmt = (
        select(Booking)
        .order_by(Booking.created_at.desc())
        .limit(limit * 3)
    )
    bookings: list[Booking] = list((await db.execute(stmt)).scalars().all())

    client_ids = {b.client_id for b in bookings}
    service_ids = {b.service_id for b in bookings}

    clients_map: dict[Any, Client] = {}
    services_map: dict[Any, Service] = {}
    if client_ids:
        rows = (await db.execute(select(Client).where(Client.id.in_(client_ids)))).scalars().all()
        clients_map = {c.id: c for c in rows}
    if service_ids:
        rows_s = (await db.execute(select(Service).where(Service.id.in_(service_ids)))).scalars().all()
        services_map = {s.id: s for s in rows_s}

    items: list[NotificationItem] = []
    for b in bookings:
        cname = _client_name(clients_map.get(b.client_id))
        sname = _svc_name(services_map.get(b.service_id))
        body = f"{cname} · {sname}"

        status_val = b.status.value if hasattr(b.status, "value") else str(b.status)

        if status_val == "pending":
            ntype, title, color = "new_booking", "Новая запись", "amber"
        elif status_val == "confirmed":
            ntype, title, color = "confirmed", "Запись подтверждена", "green"
        elif status_val in ("cancelled_by_salon", "cancelled_by_client"):
            ntype, title, color = "cancelled", "Запись отменена", "red"
        elif status_val == "completed":
            ntype, title, color = "completed", "Запись завершена", "green"
        else:
            continue

        items.append(
            NotificationItem(
                id=str(b.id),
                type=ntype,
                title=title,
                body=body,
                color=color,
                created_at=b.created_at.isoformat(),
                booking_id=str(b.id),
            )
        )
        if len(items) >= limit:
            break

    return NotificationsResponse(items=items, total=len(items))
