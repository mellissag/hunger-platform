"""Client-facing loyalty endpoints (/me)."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.mini_app import (
    MiniAppUser,
    get_mini_app_user,
    _mini_app_has_identity,
    _resolve_lang,
    _resolve_mini_app_client,
)
from app.deps import get_db
from app.models.client import Client
from app.models.loyalty import LoyaltyTransaction
from app.schemas.loyalty import (
    MeLoyaltyOut,
    MeLoyaltyTransactionOut,
    ReferralCodeOut,
)
from app.services import loyalty_service

router = APIRouter(prefix="/me", tags=["me"])


async def _require_client(
    current_user: MiniAppUser,
    db: AsyncSession,
) -> Client:
    if not _mini_app_has_identity(current_user):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No Telegram user")
    return await _resolve_mini_app_client(current_user, db)


@router.get("/loyalty", response_model=MeLoyaltyOut)
async def get_my_loyalty(
    current_user: Annotated[MiniAppUser, Depends(get_mini_app_user)],
    db: AsyncSession = Depends(get_db),
) -> MeLoyaltyOut:
    client = await _require_client(current_user, db)
    lang = _resolve_lang(current_user.language_code or client.lang)
    data = await loyalty_service.build_me_loyalty(db, client, lang)
    return MeLoyaltyOut.model_validate(data)


@router.get("/loyalty/transactions", response_model=list[MeLoyaltyTransactionOut])
async def get_my_transactions(
    current_user: Annotated[MiniAppUser, Depends(get_mini_app_user)],
    db: AsyncSession = Depends(get_db),
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> list[MeLoyaltyTransactionOut]:
    client = await _require_client(current_user, db)
    rows = (
        await db.execute(
            select(LoyaltyTransaction)
            .where(LoyaltyTransaction.client_id == client.id)
            .order_by(LoyaltyTransaction.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
    ).scalars().all()
    return [MeLoyaltyTransactionOut.model_validate(r) for r in rows]


@router.get("/referral-code", response_model=ReferralCodeOut)
async def get_referral_code(
    current_user: Annotated[MiniAppUser, Depends(get_mini_app_user)],
    db: AsyncSession = Depends(get_db),
) -> ReferralCodeOut:
    client = await _require_client(current_user, db)
    ref = await loyalty_service.get_or_create_referral_code(db, client.id)
    return ReferralCodeOut(
        code=ref.code,
        uses_count=ref.uses_count,
        link=loyalty_service.referral_link(ref.code),
    )
