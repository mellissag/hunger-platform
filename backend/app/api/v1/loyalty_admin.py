"""Admin API: loyalty settings, statuses, promo codes, transactions."""

from __future__ import annotations

from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.deps import get_db, require_roles
from app.models.client import Client
from app.models.enums import LoyaltyTransactionType, UserRole
from app.models.loyalty import ClientStatus, LoyaltySettings, LoyaltyTransaction, PromoCode
from app.models.user import User
from app.schemas.loyalty import (
    AdjustPointsIn,
    ClientStatusCreate,
    ClientStatusOut,
    ClientStatusReorder,
    ClientStatusUpdate,
    LoyaltySettingsOut,
    LoyaltySettingsUpdate,
    LoyaltyTransactionOut,
    PromoCodeCreate,
    PromoCodeOut,
    PromoCodeUpdate,
)
from app.services import loyalty_service

router = APIRouter(prefix="/admin/loyalty", tags=["loyalty-admin"])

AdminUser = Annotated[User, Depends(require_roles(UserRole.owner, UserRole.admin))]


@router.get("/settings", response_model=LoyaltySettingsOut)
async def get_settings(
    _user: AdminUser,
    db: AsyncSession = Depends(get_db),
) -> LoyaltySettings:
    return await loyalty_service.get_loyalty_settings(db)


@router.put("/settings", response_model=LoyaltySettingsOut)
async def update_settings(
    body: LoyaltySettingsUpdate,
    _user: AdminUser,
    db: AsyncSession = Depends(get_db),
) -> LoyaltySettings:
    row = await loyalty_service.get_loyalty_settings(db)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    await db.flush()
    return row


@router.get("/statuses", response_model=list[ClientStatusOut])
async def list_statuses(
    _user: AdminUser,
    db: AsyncSession = Depends(get_db),
) -> list[ClientStatus]:
    return list(
        (
            await db.execute(select(ClientStatus).order_by(ClientStatus.sort_order.asc()))
        ).scalars().all()
    )


@router.post("/statuses", response_model=ClientStatusOut, status_code=status.HTTP_201_CREATED)
async def create_status(
    body: ClientStatusCreate,
    _user: AdminUser,
    db: AsyncSession = Depends(get_db),
) -> ClientStatus:
    row = ClientStatus(**body.model_dump())
    db.add(row)
    await db.flush()
    return row


@router.put("/statuses/{status_id}", response_model=ClientStatusOut)
async def update_status(
    status_id: UUID,
    body: ClientStatusUpdate,
    _user: AdminUser,
    db: AsyncSession = Depends(get_db),
) -> ClientStatus:
    row = await db.get(ClientStatus, status_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Status not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    await db.flush()
    return row


@router.delete("/statuses/{status_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_status(
    status_id: UUID,
    _user: AdminUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    row = await db.get(ClientStatus, status_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Status not found")
    await db.delete(row)
    await db.flush()


@router.put("/statuses/reorder", response_model=list[ClientStatusOut])
async def reorder_statuses(
    body: ClientStatusReorder,
    _user: AdminUser,
    db: AsyncSession = Depends(get_db),
) -> list[ClientStatus]:
    for idx, sid in enumerate(body.ids):
        row = await db.get(ClientStatus, sid)
        if row is not None:
            row.sort_order = idx
    await db.flush()
    return list(
        (
            await db.execute(select(ClientStatus).order_by(ClientStatus.sort_order.asc()))
        ).scalars().all()
    )


def _normalize_promo_code(code: str) -> str:
    return code.strip().upper()


@router.get("/promo-codes", response_model=list[PromoCodeOut])
async def list_promo_codes(
    _user: AdminUser,
    db: AsyncSession = Depends(get_db),
) -> list[PromoCode]:
    return list(
        (await db.execute(select(PromoCode).order_by(PromoCode.created_at.desc()))).scalars().all()
    )


@router.post("/promo-codes", response_model=PromoCodeOut, status_code=status.HTTP_201_CREATED)
async def create_promo_code(
    body: PromoCodeCreate,
    _user: AdminUser,
    db: AsyncSession = Depends(get_db),
) -> PromoCode:
    code = _normalize_promo_code(body.code)
    exists = (
        await db.execute(select(PromoCode.id).where(func.upper(PromoCode.code) == code))
    ).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=409, detail="Promo code already exists")
    row = PromoCode(**{**body.model_dump(), "code": code})
    db.add(row)
    await db.flush()
    return row


@router.put("/promo-codes/{promo_id}", response_model=PromoCodeOut)
async def update_promo_code(
    promo_id: UUID,
    body: PromoCodeUpdate,
    _user: AdminUser,
    db: AsyncSession = Depends(get_db),
) -> PromoCode:
    row = await db.get(PromoCode, promo_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Promo code not found")
    data = body.model_dump(exclude_unset=True)
    if "code" in data and data["code"] is not None:
        data["code"] = _normalize_promo_code(data["code"])
    for k, v in data.items():
        setattr(row, k, v)
    await db.flush()
    return row


@router.delete("/promo-codes/{promo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_promo_code(
    promo_id: UUID,
    _user: AdminUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    row = await db.get(PromoCode, promo_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Promo code not found")
    await db.delete(row)
    await db.flush()


@router.get("/transactions", response_model=list[LoyaltyTransactionOut])
async def list_transactions(
    _user: AdminUser,
    db: AsyncSession = Depends(get_db),
    client_q: str | None = Query(None, alias="client"),
    tx_type: LoyaltyTransactionType | None = Query(None, alias="type"),
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> list[LoyaltyTransactionOut]:
    stmt = (
        select(LoyaltyTransaction, Client)
        .join(Client, Client.id == LoyaltyTransaction.client_id)
        .order_by(LoyaltyTransaction.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    if tx_type is not None:
        stmt = stmt.where(LoyaltyTransaction.type == tx_type)
    if date_from is not None:
        stmt = stmt.where(func.date(LoyaltyTransaction.created_at) >= date_from)
    if date_to is not None:
        stmt = stmt.where(func.date(LoyaltyTransaction.created_at) <= date_to)
    if client_q:
        like = f"%{client_q.strip()}%"
        stmt = stmt.where(
            or_(
                Client.first_name.ilike(like),
                Client.last_name.ilike(like),
                Client.phone.ilike(like),
            )
        )
    rows = (await db.execute(stmt)).all()
    return [
        LoyaltyTransactionOut(
            id=tx.id,
            client_id=tx.client_id,
            booking_id=tx.booking_id,
            type=tx.type,
            points=tx.points,
            description=tx.description,
            created_at=tx.created_at,
            client_first_name=c.first_name,
            client_last_name=c.last_name,
        )
        for tx, c in rows
    ]
