"""Списание/восстановление склада по составу формулы (совпадение с UI: name или SKU)."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory import Product


def _norm(v: Any) -> str:
    if v is None:
        return ""
    return str(v).strip().lower()


def component_amount(comp: dict[str, Any]) -> Decimal:
    try:
        q = Decimal(str(comp.get("amount", 0)))
    except Exception:
        return Decimal(0)
    return q if q > 0 else Decimal(0)


def resolve_product_for_formula_component(comp: dict[str, Any], lookup: dict[str, Product]) -> Product | None:
    for key in (_norm(comp.get("shade")), _norm(comp.get("product"))):
        if key and (p := lookup.get(key)):
            return p
    return None


async def load_product_lookup(db: AsyncSession) -> dict[str, Product]:
    """Ключи — lower(name) и lower(sku), как на фронте в formulas-page."""
    result = await db.execute(select(Product))
    lookup: dict[str, Product] = {}
    for p in result.scalars().all():
        name = _norm(p.name)
        if name and name not in lookup:
            lookup[name] = p
        sku = _norm(p.sku)
        if sku and sku not in lookup:
            lookup[sku] = p
    return lookup


async def apply_formula_consumption(
    db: AsyncSession,
    components: list[Any],
    *,
    lookup: dict[str, Product] | None = None,
) -> None:
    if lookup is None:
        lookup = await load_product_lookup(db)
    for comp in components:
        if not isinstance(comp, dict):
            continue
        amt = component_amount(comp)
        if amt <= 0:
            continue
        p = resolve_product_for_formula_component(comp, lookup)
        if not p:
            continue
        p.current_stock = (p.current_stock or Decimal(0)) - amt


async def restore_formula_consumption(
    db: AsyncSession,
    components: list[Any],
    *,
    lookup: dict[str, Product] | None = None,
) -> None:
    if lookup is None:
        lookup = await load_product_lookup(db)
    for comp in components:
        if not isinstance(comp, dict):
            continue
        amt = component_amount(comp)
        if amt <= 0:
            continue
        p = resolve_product_for_formula_component(comp, lookup)
        if not p:
            continue
        p.current_stock = (p.current_stock or Decimal(0)) + amt
