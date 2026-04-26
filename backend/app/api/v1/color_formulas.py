"""Color formulas API."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, require_roles
from app.models.color_formula import ColorFormula
from app.models.enums import UserRole
from app.models.master import Master

router = APIRouter(prefix="/color-formulas", tags=["color-formulas"])
client_router = APIRouter(prefix="/clients", tags=["color-formulas"])

STAFF = (UserRole.owner, UserRole.admin, UserRole.reception, UserRole.master)
ADMINS = (UserRole.owner, UserRole.admin)

# ── Schemas ───────────────────────────────────────────────────────────────────


class FormulaCreate(BaseModel):
    client_id: UUID
    master_id: Optional[UUID] = None
    booking_id: Optional[UUID] = None
    technique: Optional[str] = None
    brand: Optional[str] = None
    base_color: Optional[str] = None
    base_amount_ml: Optional[Decimal] = None
    mixer_color: Optional[str] = None
    mixer_amount_ml: Optional[Decimal] = None
    developer_percent: Optional[str] = None
    developer_ml: Optional[Decimal] = None
    processing_time_min: Optional[int] = None
    result_description: Optional[str] = None
    notes: Optional[str] = None
    photo_url: Optional[str] = None


class FormulaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    client_id: UUID
    master_id: Optional[UUID] = None
    booking_id: Optional[UUID] = None
    created_at: datetime
    technique: Optional[str] = None
    brand: Optional[str] = None
    base_color: Optional[str] = None
    base_amount_ml: Optional[Decimal] = None
    mixer_color: Optional[str] = None
    mixer_amount_ml: Optional[Decimal] = None
    developer_percent: Optional[str] = None
    developer_ml: Optional[Decimal] = None
    processing_time_min: Optional[int] = None
    result_description: Optional[str] = None
    notes: Optional[str] = None
    photo_url: Optional[str] = None
    master_name: Optional[str] = None


async def _formula_out(f: ColorFormula, db: AsyncSession) -> FormulaOut:
    out = FormulaOut.model_validate(f)
    if f.master_id:
        master = await db.get(Master, f.master_id)
        if master:
            out.master_name = master.display_name
    return out


# ── Routes ────────────────────────────────────────────────────────────────────


@router.get("/", response_model=list[FormulaOut])
async def list_formulas(
    client_id: Optional[UUID] = None,
    master_id: Optional[UUID] = None,
    brand: Optional[str] = None,
    technique: Optional[str] = None,
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_roles(*STAFF)),
) -> list[FormulaOut]:
    q = select(ColorFormula).order_by(desc(ColorFormula.created_at)).limit(limit)
    if client_id:
        q = q.where(ColorFormula.client_id == client_id)
    if master_id:
        q = q.where(ColorFormula.master_id == master_id)
    if brand:
        q = q.where(ColorFormula.brand.ilike(f"%{brand}%"))
    if technique:
        q = q.where(ColorFormula.technique == technique)
    result = await db.execute(q)
    formulas = result.scalars().all()
    return [await _formula_out(f, db) for f in formulas]


@router.post("/", response_model=FormulaOut, status_code=status.HTTP_201_CREATED)
async def create_formula(
    data: FormulaCreate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_roles(*STAFF)),
) -> FormulaOut:
    formula = ColorFormula(**data.model_dump())
    db.add(formula)
    await db.commit()
    await db.refresh(formula)
    return await _formula_out(formula, db)


@router.patch("/{formula_id}", response_model=FormulaOut)
async def update_formula(
    formula_id: int,
    data: FormulaCreate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_roles(*STAFF)),
) -> FormulaOut:
    formula = await db.get(ColorFormula, formula_id)
    if not formula:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(formula, k, v)
    await db.commit()
    await db.refresh(formula)
    return await _formula_out(formula, db)


@router.delete("/{formula_id}")
async def delete_formula(
    formula_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_roles(*STAFF)),
) -> dict:
    formula = await db.get(ColorFormula, formula_id)
    if not formula:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    await db.delete(formula)
    await db.commit()
    return {"ok": True}


# ── Client sub-route: GET /clients/{client_id}/color-formulas ─────────────────


@client_router.get("/{client_id}/color-formulas", response_model=list[FormulaOut])
async def get_client_formulas(
    client_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_roles(*STAFF)),
) -> list[FormulaOut]:
    q = (
        select(ColorFormula)
        .where(ColorFormula.client_id == client_id)
        .order_by(desc(ColorFormula.created_at))
    )
    result = await db.execute(q)
    formulas = result.scalars().all()
    return [await _formula_out(f, db) for f in formulas]
