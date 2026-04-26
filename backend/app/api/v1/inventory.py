"""Inventory API: products, arrivals, write-offs."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, require_roles
from app.models.enums import UserRole
from app.models.inventory import Product, ProductArrival, ProductWriteOff

router = APIRouter(prefix="/inventory", tags=["inventory"])

STAFF = (UserRole.owner, UserRole.admin, UserRole.reception, UserRole.master)
ADMINS = (UserRole.owner, UserRole.admin)

# ── Pydantic schemas ──────────────────────────────────────────────────────────


class ProductBase(BaseModel):
    name: str
    category: Optional[str] = None
    brand: Optional[str] = None
    sku: Optional[str] = None
    unit: str = "шт"
    min_stock: Decimal = Decimal("0")
    price_per_unit: Optional[Decimal] = None
    is_active: bool = True


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    brand: Optional[str] = None
    sku: Optional[str] = None
    unit: Optional[str] = None
    min_stock: Optional[Decimal] = None
    price_per_unit: Optional[Decimal] = None
    is_active: Optional[bool] = None


class ProductOut(ProductBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    current_stock: Decimal
    created_at: datetime
    is_low_stock: bool = False


def _product_out(p: Product) -> ProductOut:
    out = ProductOut.model_validate(p)
    out.is_low_stock = float(p.current_stock or 0) <= float(p.min_stock or 0)
    return out


class ArrivalCreate(BaseModel):
    product_id: int
    quantity: Decimal
    price_per_unit: Optional[Decimal] = None
    supplier: Optional[str] = None
    invoice_number: Optional[str] = None
    arrived_at: datetime
    notes: Optional[str] = None


class ArrivalOut(ArrivalCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    total_cost: Optional[Decimal] = None
    created_at: datetime


class WriteOffCreate(BaseModel):
    product_id: int
    quantity: Decimal
    reason: Optional[str] = "использовано"
    booking_id: Optional[UUID] = None
    master_id: Optional[UUID] = None
    written_off_at: datetime
    notes: Optional[str] = None


class WriteOffOut(WriteOffCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime


# ── Products ──────────────────────────────────────────────────────────────────


@router.get("/products", response_model=list[ProductOut])
async def list_products(
    category: Optional[str] = None,
    low_stock_only: bool = False,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_roles(*STAFF)),
) -> list[ProductOut]:
    q = select(Product).where(Product.is_active == True)  # noqa: E712
    if category:
        q = q.where(Product.category == category)
    if low_stock_only:
        q = q.where(Product.current_stock <= Product.min_stock)
    q = q.order_by(Product.category, Product.name)
    result = await db.execute(q)
    return [_product_out(p) for p in result.scalars().all()]


@router.post("/products", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
async def create_product(
    data: ProductCreate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_roles(*ADMINS)),
) -> ProductOut:
    product = Product(**data.model_dump())
    db.add(product)
    await db.commit()
    await db.refresh(product)
    return _product_out(product)


@router.patch("/products/{product_id}", response_model=ProductOut)
async def update_product(
    product_id: int,
    data: ProductUpdate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_roles(*ADMINS)),
) -> ProductOut:
    product = await db.get(Product, product_id)
    if not product:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Товар не найден")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(product, k, v)
    await db.commit()
    await db.refresh(product)
    return _product_out(product)


@router.delete("/products/{product_id}")
async def delete_product(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_roles(*ADMINS)),
) -> dict:
    product = await db.get(Product, product_id)
    if not product:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Товар не найден")
    product.is_active = False
    await db.commit()
    return {"ok": True}


# ── Arrivals ──────────────────────────────────────────────────────────────────


@router.get("/arrivals", response_model=list[ArrivalOut])
async def list_arrivals(
    product_id: Optional[int] = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_roles(*STAFF)),
) -> list[ArrivalOut]:
    q = (
        select(ProductArrival)
        .order_by(desc(ProductArrival.arrived_at))
        .limit(limit)
        .offset(offset)
    )
    if product_id:
        q = q.where(ProductArrival.product_id == product_id)
    result = await db.execute(q)
    return list(result.scalars().all())


@router.post("/arrivals", response_model=ArrivalOut, status_code=status.HTTP_201_CREATED)
async def create_arrival(
    data: ArrivalCreate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_roles(*ADMINS)),
) -> ProductArrival:
    product = await db.get(Product, data.product_id)
    if not product:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Товар не найден")

    total = None
    if data.price_per_unit:
        total = data.quantity * data.price_per_unit

    arrival = ProductArrival(**data.model_dump(), total_cost=total)
    db.add(arrival)

    product.current_stock = (product.current_stock or Decimal("0")) + data.quantity
    if data.price_per_unit:
        product.price_per_unit = data.price_per_unit

    await db.commit()
    await db.refresh(arrival)
    return arrival


@router.delete("/arrivals/{arrival_id}")
async def delete_arrival(
    arrival_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_roles(*ADMINS)),
) -> dict:
    arrival = await db.get(ProductArrival, arrival_id)
    if not arrival:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    product = await db.get(Product, arrival.product_id)
    if product:
        product.current_stock = max(
            Decimal("0"),
            (product.current_stock or Decimal("0")) - arrival.quantity,
        )
    await db.delete(arrival)
    await db.commit()
    return {"ok": True}


# ── Write-offs ────────────────────────────────────────────────────────────────


@router.get("/write-offs", response_model=list[WriteOffOut])
async def list_write_offs(
    product_id: Optional[int] = None,
    master_id: Optional[UUID] = None,
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_roles(*STAFF)),
) -> list[WriteOffOut]:
    q = (
        select(ProductWriteOff)
        .order_by(desc(ProductWriteOff.written_off_at))
        .limit(limit)
    )
    if product_id:
        q = q.where(ProductWriteOff.product_id == product_id)
    if master_id:
        q = q.where(ProductWriteOff.master_id == master_id)
    result = await db.execute(q)
    return list(result.scalars().all())


@router.post("/write-offs", response_model=WriteOffOut, status_code=status.HTTP_201_CREATED)
async def create_write_off(
    data: WriteOffCreate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_roles(*STAFF)),
) -> ProductWriteOff:
    product = await db.get(Product, data.product_id)
    if not product:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Товар не найден")
    if float(product.current_stock or 0) < float(data.quantity):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Недостаточно на складе. Доступно: {product.current_stock} {product.unit}",
        )

    write_off = ProductWriteOff(**data.model_dump())
    db.add(write_off)
    product.current_stock = (product.current_stock or Decimal("0")) - data.quantity
    await db.commit()
    await db.refresh(write_off)
    return write_off


# ── Stats ─────────────────────────────────────────────────────────────────────


@router.get("/stats")
async def inventory_stats(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_roles(*STAFF)),
) -> dict:
    total_products = await db.scalar(
        select(func.count()).where(Product.is_active == True)  # noqa: E712
    )
    low_stock = await db.scalar(
        select(func.count()).where(
            Product.is_active == True,  # noqa: E712
            Product.current_stock <= Product.min_stock,
        )
    )
    total_arrivals_cost = await db.scalar(select(func.sum(ProductArrival.total_cost))) or 0

    return {
        "total_products": total_products or 0,
        "low_stock_count": low_stock or 0,
        "total_arrivals_cost": float(total_arrivals_cost),
    }
