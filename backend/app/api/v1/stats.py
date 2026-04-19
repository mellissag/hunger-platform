"""Статистика салона (owner/admin)."""

from __future__ import annotations

from datetime import date
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, require_roles
from app.models.enums import UserRole
from app.models.user import User
from app.services import (
    booking_stats_service,
    bot_stats_service,
    master_stats_service,
    service_stats_service,
    stats_export_service,
)

router = APIRouter(prefix="/stats", tags=["stats"])

STATS_ROLES = (UserRole.owner, UserRole.admin)


def parse_period(
    from_: Annotated[date, Query(alias="from")],
    to: Annotated[date, Query(alias="to")],
) -> tuple[date, date]:
    if from_ > to:
        raise HTTPException(status_code=400, detail="from must be <= to")
    return from_, to


@router.get("/overview")
async def stats_overview(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*STATS_ROLES))],
    period: Annotated[tuple[date, date], Depends(parse_period)],
) -> dict:
    dfrom, dto = period
    overview = await booking_stats_service.get_booking_overview(db, dfrom=dfrom, dto=dto)
    trend = await booking_stats_service.get_revenue_trend_daily(db, dfrom=dfrom, dto=dto)
    heatmap = await booking_stats_service.get_heatmap(db, dfrom=dfrom, dto=dto)
    currency = await booking_stats_service.get_currency(db)
    return {
        "period": {"from": dfrom.isoformat(), "to": dto.isoformat()},
        "kpi": overview,
        "revenue_trend": trend,
        "heatmap": heatmap,
        "currency": currency,
    }


@router.get("/bot")
async def stats_bot(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*STATS_ROLES))],
    period: Annotated[tuple[date, date], Depends(parse_period)],
) -> dict:
    dfrom, dto = period
    stats = await bot_stats_service.get_bot_stats(db, dfrom=dfrom, dto=dto)
    funnel_daily = await bot_stats_service.get_bot_funnel_series(db, dfrom=dfrom, dto=dto)
    return {"stats": stats, "joins_by_day": funnel_daily}


@router.get("/bookings")
async def stats_bookings(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*STATS_ROLES))],
    period: Annotated[tuple[date, date], Depends(parse_period)],
) -> dict:
    dfrom, dto = period
    return {
        "period": {"from": dfrom.isoformat(), "to": dto.isoformat()},
        "overview": await booking_stats_service.get_booking_overview(db, dfrom=dfrom, dto=dto),
        "revenue_trend": await booking_stats_service.get_revenue_trend_daily(db, dfrom=dfrom, dto=dto),
        "heatmap": await booking_stats_service.get_heatmap(db, dfrom=dfrom, dto=dto),
        "currency": await booking_stats_service.get_currency(db),
    }


@router.get("/masters")
async def stats_masters(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*STATS_ROLES))],
    period: Annotated[tuple[date, date], Depends(parse_period)],
) -> dict:
    dfrom, dto = period
    rows = await master_stats_service.list_master_stats(db, dfrom=dfrom, dto=dto)
    return {"period": {"from": dfrom.isoformat(), "to": dto.isoformat()}, "masters": rows}


@router.get("/masters/{master_id}")
async def stats_master_detail(
    master_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*STATS_ROLES))],
    period: Annotated[tuple[date, date], Depends(parse_period)],
) -> dict:
    dfrom, dto = period
    row = await master_stats_service.get_master_detail_stats(db, master_id=master_id, dfrom=dfrom, dto=dto)
    if row is None:
        raise HTTPException(status_code=404, detail="Master not found")
    return row


@router.get("/services/top")
async def stats_services_top(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*STATS_ROLES))],
    period: Annotated[tuple[date, date], Depends(parse_period)],
    limit: int = Query(20, ge=1, le=100),
) -> dict:
    dfrom, dto = period
    top = await service_stats_service.top_services_by_revenue(db, dfrom=dfrom, dto=dto, limit=limit)
    return {"period": {"from": dfrom.isoformat(), "to": dto.isoformat()}, "top": top}


@router.get("/services/dead")
async def stats_services_dead(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*STATS_ROLES))],
    to: Annotated[date, Query(alias="to")],
    dead_days: int = Query(30, ge=1, le=365),
) -> dict:
    dead = await service_stats_service.dead_services(db, dto=to, dead_days=dead_days)
    return {"to": to.isoformat(), "dead_days": dead_days, "dead": dead}


@router.get("/finance/payroll")
async def stats_finance_payroll(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*STATS_ROLES))],
    period: Annotated[tuple[date, date], Depends(parse_period)],
) -> dict:
    dfrom, dto = period
    rows = await master_stats_service.list_master_stats(db, dfrom=dfrom, dto=dto)
    currency = await booking_stats_service.get_currency(db)
    total = sum(float(r["payroll_amount"]) for r in rows) if rows else 0.0
    return {
        "period": {"from": dfrom.isoformat(), "to": dto.isoformat()},
        "currency": currency,
        "total_payroll": round(total, 2),
        "rows": rows,
    }


@router.get("/finance/export")
async def stats_finance_export(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*STATS_ROLES))],
    period: Annotated[tuple[date, date], Depends(parse_period)],
    export_format: Literal["xlsx", "pdf"] = Query("xlsx", alias="format"),
) -> Response:
    dfrom, dto = period
    rows = await master_stats_service.list_master_stats(db, dfrom=dfrom, dto=dto)
    label = f"{dfrom.isoformat()} — {dto.isoformat()}"
    if export_format == "xlsx":
        body = stats_export_service.payroll_to_xlsx(rows, period_label=label)
        return Response(
            content=body,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f'attachment; filename="payroll-{dfrom}-{dto}.xlsx"',
            },
        )
    body = stats_export_service.payroll_to_pdf(rows, period_label=label)
    return Response(
        content=body,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="payroll-{dfrom}-{dto}.pdf"'},
    )
