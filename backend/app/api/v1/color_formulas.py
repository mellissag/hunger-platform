"""Color formulas API — JSONB components."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
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


class FormulaComponent(BaseModel):
    brand: str
    shade: str
    amount: float
    unit: str


class FormulaCreate(BaseModel):
    client_id: UUID
    master_id: Optional[UUID] = None
    booking_id: Optional[UUID] = None
    components: list[FormulaComponent] = []
    service_name: Optional[str] = None
    applied_at: datetime
    result_notes: Optional[str] = None
    exposure_minutes: Optional[int] = None
    photo_urls: Optional[list[str]] = None
    client_rating: Optional[int] = None


class FormulaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    client_id: UUID
    master_id: Optional[UUID] = None
    booking_id: Optional[UUID] = None
    created_at: datetime
    components: list[Any] = []
    service_name: Optional[str] = None
    applied_at: datetime
    result_notes: Optional[str] = None
    exposure_minutes: Optional[int] = None
    photo_urls: Optional[list[str]] = None
    client_rating: Optional[int] = None
    master_name: Optional[str] = None
    client_name: Optional[str] = None


async def _enrich(f: ColorFormula, db: AsyncSession) -> FormulaOut:
    out = FormulaOut.model_validate(f)
    if f.master_id:
        master = await db.get(Master, f.master_id)
        if master:
            out.master_name = master.display_name
    # client name via backref
    if f.client:
        name = " ".join(
            filter(None, [f.client.first_name, f.client.last_name])
        ) or f.client.phone or str(f.client_id)[:8]
        out.client_name = name
    return out


# ── Routes ────────────────────────────────────────────────────────────────────


@router.get("/", response_model=list[FormulaOut])
async def list_formulas(
    client_id: Optional[UUID] = None,
    master_id: Optional[UUID] = None,
    search: Optional[str] = None,
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_roles(*STAFF)),
) -> list[FormulaOut]:
    q = select(ColorFormula).order_by(desc(ColorFormula.applied_at)).limit(limit)
    if client_id:
        q = q.where(ColorFormula.client_id == client_id)
    if master_id:
        q = q.where(ColorFormula.master_id == master_id)
    result = await db.execute(q)
    formulas = result.scalars().all()

    out = []
    for f in formulas:
        enriched = await _enrich(f, db)
        if search:
            haystack = (
                (enriched.client_name or "")
                + str(f.components)
                + (f.service_name or "")
                + (enriched.master_name or "")
            ).lower()
            if search.lower() not in haystack:
                continue
        out.append(enriched)
    return out


@router.post("/", response_model=FormulaOut, status_code=status.HTTP_201_CREATED)
async def create_formula(
    data: FormulaCreate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_roles(*STAFF)),
) -> FormulaOut:
    dump = data.model_dump()
    dump["components"] = [c.model_dump() for c in data.components]
    formula = ColorFormula(**dump)
    db.add(formula)
    await db.commit()
    await db.refresh(formula)
    return await _enrich(formula, db)


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
    dump = data.model_dump(exclude_unset=True)
    if "components" in dump:
        dump["components"] = [c.model_dump() if hasattr(c, "model_dump") else c for c in dump["components"]]
    for k, v in dump.items():
        setattr(formula, k, v)
    await db.commit()
    await db.refresh(formula)
    return await _enrich(formula, db)


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


# ── Client sub-route ──────────────────────────────────────────────────────────


@client_router.get("/{client_id}/color-formulas", response_model=list[FormulaOut])
async def get_client_formulas(
    client_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_roles(*STAFF)),
) -> list[FormulaOut]:
    q = (
        select(ColorFormula)
        .where(ColorFormula.client_id == client_id)
        .order_by(desc(ColorFormula.applied_at))
    )
    result = await db.execute(q)
    formulas = result.scalars().all()
    return [await _enrich(f, db) for f in formulas]
