"""Inventory API: products, supply invoices, write-offs, stats."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import desc, distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.deps import get_db, require_roles
from app.models.enums import UserRole
from app.models.inventory import Product, ProductWriteOff, SupplyInvoice, SupplyInvoiceItem
from app.models.user import User

router = APIRouter(prefix="/inventory", tags=["inventory"])

STAFF = (UserRole.owner, UserRole.admin, UserRole.reception, UserRole.master)
ADMINS = (UserRole.owner, UserRole.admin)

# ── Pydantic schemas ──────────────────────────────────────────────────────────


class ProductBase(BaseModel):
    name: str
    brand: Optional[str] = None
    sku: Optional[str] = None
    unit: str = "шт"
    category: Optional[str] = None
    min_stock: Decimal = Decimal("0")
    cost_price: Optional[Decimal] = None
    is_active: bool = True


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    brand: Optional[str] = None
    sku: Optional[str] = None
    unit: Optional[str] = None
    category: Optional[str] = None
    min_stock: Optional[Decimal] = None
    cost_price: Optional[Decimal] = None
    is_active: Optional[bool] = None


class ProductOut(ProductBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    current_stock: Decimal
    created_at: datetime
    is_low_stock: bool = False


def _product_out(p: Product) -> ProductOut:
    out = ProductOut.model_validate(p)
    out.is_low_stock = (
        float(p.min_stock or 0) > 0
        and float(p.current_stock or 0) <= float(p.min_stock or 0)
    )
    return out


class InvoiceItemCreate(BaseModel):
    product_id: int
    quantity: Decimal
    price_per_unit: Optional[Decimal] = None
    notes: Optional[str] = None


class InvoiceItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    product_id: int
    product: ProductOut
    quantity: Decimal
    price_per_unit: Optional[Decimal] = None
    total: Optional[Decimal] = None
    notes: Optional[str] = None


class SupplyInvoiceCreate(BaseModel):
    invoice_number: Optional[str] = None
    supplier: Optional[str] = None
    arrived_at: datetime
    notes: Optional[str] = None
    items: list[InvoiceItemCreate]


class SupplyInvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    invoice_number: Optional[str] = None
    supplier: Optional[str] = None
    arrived_at: datetime
    total_cost: Optional[Decimal] = None
    notes: Optional[str] = None
    items: list[InvoiceItemOut] = []
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


class StockAdjustRequest(BaseModel):
    direction: Literal["add", "subtract"]
    quantity: Decimal = Field(gt=0)
    comment: Optional[str] = None


# ── Products ──────────────────────────────────────────────────────────────────


@router.get("/products", response_model=list[ProductOut])
async def list_products(
    category: Optional[str] = None,
    low_stock_only: bool = False,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_roles(*STAFF)),
) -> list[ProductOut]:
    q = select(Product).where(Product.is_active == True)  # noqa: E712
    if category:
        q = q.where(Product.category == category)
    if low_stock_only:
        q = q.where(
            Product.min_stock > 0,
            Product.current_stock <= Product.min_stock,
        )
    if search:
        q = q.where(Product.name.ilike(f"%{search}%"))
    q = q.order_by(Product.category, Product.name)
    result = await db.execute(q)
    return [_product_out(p) for p in result.scalars().all()]


@router.get("/products/categories", response_model=list[str])
async def list_categories(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_roles(*STAFF)),
) -> list[str]:
    result = await db.execute(
        select(distinct(Product.category))
        .where(Product.is_active == True, Product.category.is_not(None))  # noqa: E712
    )
    db_cats = [r[0] for r in result.fetchall() if r[0]]
    defaults = ["Краски для волос", "Уходовая косметика", "Расходники", "Инструменты"]
    merged = list({*defaults, *db_cats})
    return sorted(merged)


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


@router.post("/products/{product_id}/adjust-stock", response_model=ProductOut)
async def adjust_product_stock(
    product_id: int,
    body: StockAdjustRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(*ADMINS)),
) -> ProductOut:
    """Ручная корректировка остатка (приход / списание). Допускает отрицательный остаток."""
    product = await db.get(Product, product_id)
    if not product:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Товар не найден")
    q = body.quantity
    base = product.current_stock or Decimal("0")
    if body.direction == "add":
        product.current_stock = base + q
    else:
        product.current_stock = base - q
        db.add(
            ProductWriteOff(
                product_id=product_id,
                quantity=q,
                reason="manual_adjust",
                notes=body.comment,
                written_off_at=datetime.now(timezone.utc),
            )
        )
    await db.commit()
    await db.refresh(product)
    return _product_out(product)


# ── Supply invoices ────────────────────────────────────────────────────────────


@router.get("/invoices", response_model=list[SupplyInvoiceOut])
async def list_invoices(
    limit: int = Query(50, le=200),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_roles(*ADMINS)),
) -> list[SupplyInvoice]:
    q = (
        select(SupplyInvoice)
        .options(selectinload(SupplyInvoice.items).selectinload(SupplyInvoiceItem.product))
        .order_by(desc(SupplyInvoice.arrived_at))
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(q)
    return list(result.scalars().all())


@router.get("/invoices/{invoice_id}", response_model=SupplyInvoiceOut)
async def get_invoice(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_roles(*ADMINS)),
) -> SupplyInvoice:
    q = (
        select(SupplyInvoice)
        .options(selectinload(SupplyInvoice.items).selectinload(SupplyInvoiceItem.product))
        .where(SupplyInvoice.id == invoice_id)
    )
    result = await db.execute(q)
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    return invoice


@router.post("/invoices", response_model=SupplyInvoiceOut, status_code=status.HTTP_201_CREATED)
async def create_invoice(
    data: SupplyInvoiceCreate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_roles(*ADMINS)),
) -> SupplyInvoice:
    invoice = SupplyInvoice(
        invoice_number=data.invoice_number,
        supplier=data.supplier,
        arrived_at=data.arrived_at,
        notes=data.notes,
    )
    db.add(invoice)
    await db.flush()

    total = Decimal("0")
    for item_data in data.items:
        product = await db.get(Product, item_data.product_id)
        if not product:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"Товар {item_data.product_id} не найден")
        item_total = None
        if item_data.price_per_unit is not None:
            item_total = item_data.quantity * item_data.price_per_unit
            total += item_total
        item = SupplyInvoiceItem(
            invoice_id=invoice.id,
            product_id=item_data.product_id,
            quantity=item_data.quantity,
            price_per_unit=item_data.price_per_unit,
            total=item_total,
            notes=item_data.notes,
        )
        db.add(item)
        product.current_stock = (product.current_stock or Decimal("0")) + item_data.quantity

    invoice.total_cost = total
    await db.commit()

    # Reload with items
    q = (
        select(SupplyInvoice)
        .options(selectinload(SupplyInvoice.items).selectinload(SupplyInvoiceItem.product))
        .where(SupplyInvoice.id == invoice.id)
    )
    result = await db.execute(q)
    return result.scalar_one()


@router.delete("/invoices/{invoice_id}")
async def delete_invoice(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_roles(*ADMINS)),
) -> dict:
    invoice = await db.get(SupplyInvoice, invoice_id)
    if not invoice:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    await db.delete(invoice)
    await db.commit()
    return {"ok": True}


# ── Write-offs ────────────────────────────────────────────────────────────────


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
    wo = ProductWriteOff(**data.model_dump())
    db.add(wo)
    product.current_stock = (product.current_stock or Decimal("0")) - data.quantity
    await db.commit()
    await db.refresh(wo)
    return wo


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
            Product.min_stock > 0,
            Product.current_stock <= Product.min_stock,
        )
    )
    total_value_q = await db.scalar(
        select(func.sum(Product.current_stock * Product.cost_price)).where(
            Product.is_active == True,  # noqa: E712
            Product.cost_price != None,  # noqa: E711
        )
    )
    return {
        "total_products": total_products or 0,
        "low_stock_count": low_stock or 0,
        "total_stock_value": float(total_value_q or 0),
    }
