"""Статистика салона (owner/admin)."""

from __future__ import annotations

from datetime import date
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, require_roles
from app.models.enums import UserRole
from app.models.master import Master
from app.models.user import User
from app.services import (
    booking_stats_service,
    bot_stats_service,
    master_stats_service,
    service_stats_service,
    stats_export_service,
)

router = APIRouter(prefix="/stats", tags=["stats"])

# owner/admin — полный доступ; master — только свои данные (master_id принудительно подставляется)
STATS_ROLES = (UserRole.owner, UserRole.admin, UserRole.master)


def parse_period(
    from_: Annotated[date, Query(alias="from")],
    to: Annotated[date, Query(alias="to")],
) -> tuple[date, date]:
    if from_ > to:
        raise HTTPException(status_code=400, detail="from must be <= to")
    return from_, to


def _scoped_master_id(user: User, requested: UUID | None) -> UUID | None:
    """Master role: force scope to own master_id, regardless of request param.
    Если master не привязан к Master-профилю — 403, иначе данные были бы анскопными.
    owner/admin: pass-through requested filter (None == все мастера)."""
    if user.role == UserRole.master:
        if user.master_id is None:
            raise HTTPException(status_code=403, detail="Master profile is not linked")
        return user.master_id
    return requested


@router.get("/overview")
async def stats_overview(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*STATS_ROLES))],
    period: Annotated[tuple[date, date], Depends(parse_period)],
    master_id: UUID | None = Query(None),
    group_by: Literal["day", "week", "month"] = Query("day"),
) -> dict:
    dfrom, dto = period
    master_id = _scoped_master_id(user, master_id)
    overview = await booking_stats_service.get_booking_overview(
        db, dfrom=dfrom, dto=dto, master_id=master_id
    )
    trend = await booking_stats_service.get_revenue_trend(
        db, dfrom=dfrom, dto=dto, group_by=group_by, master_id=master_id
    )
    heatmap = await booking_stats_service.get_heatmap(
        db, dfrom=dfrom, dto=dto, master_id=master_id
    )
    peak_hours = await booking_stats_service.get_peak_hours(
        db, dfrom=dfrom, dto=dto, master_id=master_id
    )
    sources = await booking_stats_service.get_booking_sources(
        db, dfrom=dfrom, dto=dto, master_id=master_id
    )
    funnel = await booking_stats_service.get_funnel(
        db, dfrom=dfrom, dto=dto, master_id=master_id
    )
    top_services_revenue = await booking_stats_service.get_top_services(
        db, dfrom=dfrom, dto=dto, master_id=master_id, limit=5, order_by="revenue"
    )
    top_services_popularity = await booking_stats_service.get_top_services(
        db, dfrom=dfrom, dto=dto, master_id=master_id, limit=5, order_by="popularity"
    )
    currency = await booking_stats_service.get_currency(db)
    return {
        "period": {"from": dfrom.isoformat(), "to": dto.isoformat()},
        "group_by": group_by,
        "master_id": str(master_id) if master_id else None,
        "kpi": overview,
        "revenue_trend": trend,
        "heatmap": heatmap,
        "peak_hours": peak_hours,
        "sources": sources,
        "funnel": funnel,
        "top_services_revenue": top_services_revenue,
        "top_services_popularity": top_services_popularity,
        "currency": currency,
    }


@router.get("/masters-list")
async def stats_masters_list(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*STATS_ROLES))],
) -> dict:
    """Лёгкий список мастеров (для дропдауна-фильтра).
    Master видит только себя — фильтр для других мастеров недоступен."""
    stmt = select(Master).order_by(Master.sort_order.asc())
    if user.role == UserRole.master and user.master_id is not None:
        stmt = stmt.where(Master.id == user.master_id)
    rows = (await db.execute(stmt)).scalars().all()
    return {
        "masters": [
            {"master_id": str(m.id), "display_name": m.display_name} for m in rows
        ]
    }


@router.get("/bot")
async def stats_bot(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(UserRole.owner, UserRole.admin))],
    period: Annotated[tuple[date, date], Depends(parse_period)],
) -> dict:
    """Бот-статистика — owner/admin only. Master не видит вкладку «Бот»."""
    dfrom, dto = period
    stats = await bot_stats_service.get_bot_stats(db, dfrom=dfrom, dto=dto)
    funnel_daily = await bot_stats_service.get_bot_funnel_series(db, dfrom=dfrom, dto=dto)
    activity = await bot_stats_service.get_bot_activity_daily(db, dfrom=dfrom, dto=dto)
    retention = await bot_stats_service.get_bot_retention(db, dfrom=dfrom, dto=dto)
    return {
        "stats": stats,
        "joins_by_day": funnel_daily,
        "activity_by_day": activity,
        "retention": retention,
    }


@router.get("/bookings")
async def stats_bookings(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*STATS_ROLES))],
    period: Annotated[tuple[date, date], Depends(parse_period)],
) -> dict:
    dfrom, dto = period
    master_id = _scoped_master_id(user, None)
    return {
        "period": {"from": dfrom.isoformat(), "to": dto.isoformat()},
        "overview": await booking_stats_service.get_booking_overview(
            db, dfrom=dfrom, dto=dto, master_id=master_id
        ),
        "revenue_trend": await booking_stats_service.get_revenue_trend_daily(
            db, dfrom=dfrom, dto=dto, master_id=master_id
        ),
        "heatmap": await booking_stats_service.get_heatmap(
            db, dfrom=dfrom, dto=dto, master_id=master_id
        ),
        "currency": await booking_stats_service.get_currency(db),
    }


@router.get("/masters")
async def stats_masters(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*STATS_ROLES))],
    period: Annotated[tuple[date, date], Depends(parse_period)],
) -> dict:
    dfrom, dto = period
    rows = await master_stats_service.list_master_stats(db, dfrom=dfrom, dto=dto)
    # Master: оставить только свою строку
    if user.role == UserRole.master and user.master_id is not None:
        rows = [r for r in rows if r.get("master_id") == str(user.master_id)]
    currency = await booking_stats_service.get_currency(db)
    return {
        "period": {"from": dfrom.isoformat(), "to": dto.isoformat()},
        "currency": currency,
        "masters": rows,
    }


@router.get("/masters/{master_id}")
async def stats_master_detail(
    master_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*STATS_ROLES))],
    period: Annotated[tuple[date, date], Depends(parse_period)],
) -> dict:
    dfrom, dto = period
    # Master can only request his own detail
    if user.role == UserRole.master and user.master_id != master_id:
        raise HTTPException(status_code=403, detail="forbidden")
    row = await master_stats_service.get_master_detail_stats(
        db, master_id=master_id, dfrom=dfrom, dto=dto
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Master not found")
    currency = await booking_stats_service.get_currency(db)
    return {**row, "currency": currency}


@router.get("/services/top")
async def stats_services_top(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*STATS_ROLES))],
    period: Annotated[tuple[date, date], Depends(parse_period)],
    limit: int = Query(20, ge=1, le=100),
    order_by: Literal["revenue", "popularity"] = Query("revenue"),
) -> dict:
    dfrom, dto = period
    master_id = _scoped_master_id(user, None)
    top = await service_stats_service.top_services(
        db, dfrom=dfrom, dto=dto, limit=limit, order_by=order_by, master_id=master_id
    )
    currency = await booking_stats_service.get_currency(db)
    return {
        "period": {"from": dfrom.isoformat(), "to": dto.isoformat()},
        "order_by": order_by,
        "currency": currency,
        "top": top,
    }


@router.get("/services/dead")
async def stats_services_dead(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(UserRole.owner, UserRole.admin))],
    to: Annotated[date, Query(alias="to")],
    dead_days: int = Query(30, ge=1, le=365),
) -> dict:
    dead = await service_stats_service.dead_services(db, dto=to, dead_days=dead_days)
    return {"to": to.isoformat(), "dead_days": dead_days, "dead": dead}


@router.get("/finance/payroll")
async def stats_finance_payroll(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(UserRole.owner, UserRole.admin))],
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
    _user: Annotated[User, Depends(require_roles(UserRole.owner, UserRole.admin))],
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


@router.get("/export")
async def stats_full_export(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*STATS_ROLES))],
    period: Annotated[tuple[date, date], Depends(parse_period)],
    export_format: Literal["csv", "pdf"] = Query("csv", alias="format"),
    master_id: UUID | None = Query(None),
) -> Response:
    """Универсальный экспорт снапшота статистики: CSV или PDF."""
    dfrom, dto = period
    master_id = _scoped_master_id(user, master_id)
    label = f"{dfrom.isoformat()} — {dto.isoformat()}"
    kpi = await booking_stats_service.get_booking_overview(
        db, dfrom=dfrom, dto=dto, master_id=master_id
    )
    trend = await booking_stats_service.get_revenue_trend(
        db, dfrom=dfrom, dto=dto, group_by="day", master_id=master_id
    )
    masters = await master_stats_service.list_master_stats(db, dfrom=dfrom, dto=dto)
    top = await service_stats_service.top_services(
        db, dfrom=dfrom, dto=dto, limit=10, order_by="revenue"
    )
    currency = await booking_stats_service.get_currency(db)

    if export_format == "csv":
        body = stats_export_service.stats_snapshot_to_csv(
            period_label=label,
            kpi=kpi,
            revenue_trend=trend,
            masters=masters,
            services_top=top,
        )
        return Response(
            content=body,
            media_type="text/csv; charset=utf-8",
            headers={
                "Content-Disposition": f'attachment; filename="statistics-{dfrom}-{dto}.csv"',
            },
        )
    body = stats_export_service.stats_snapshot_to_pdf(
        period_label=label,
        kpi=kpi,
        masters=masters,
        services_top=top,
        currency=currency,
    )
    return Response(
        content=body,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="statistics-{dfrom}-{dto}.pdf"',
        },
    )
