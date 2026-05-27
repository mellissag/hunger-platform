"""API раздела «Отчёты»."""

from __future__ import annotations

from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.reports_access import ReportsUser, require_reports_access
from app.deps import get_db, require_roles
from app.models.enums import ExpenseCategory, UserRole
from app.models.master import Master
from app.models.salon import Salon
from app.models.user import User
from app.schemas.reports import (
    CashReportOut,
    ExpenseCreate,
    ExpenseOut,
    ExpenseUpdate,
    MarkSalaryPaidIn,
    PnlOut,
    ReportsAccessUpdate,
    SalariesReportOut,
    SalaryPaymentHistoryOut,
    SalarySettingsOut,
    SalarySettingsUpdate,
)
from app.services import reports_export_service, reports_service

router = APIRouter(prefix="/reports", tags=["reports"])


def _period(
    period_start: Annotated[date, Query()],
    period_end: Annotated[date, Query()],
) -> tuple[date, date]:
    return period_start, period_end


@router.get("/pnl", response_model=PnlOut)
async def get_pnl(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: ReportsUser,
    period: Annotated[tuple[date, date], Depends(_period)],
) -> dict:
    dfrom, dto = period
    return await reports_service.get_pnl(db, dfrom=dfrom, dto=dto)


@router.get("/cash", response_model=CashReportOut)
async def get_cash(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: ReportsUser,
    period: Annotated[tuple[date, date], Depends(_period)],
    payment_method: Annotated[str, Query()] = "all",
) -> dict:
    dfrom, dto = period
    return await reports_service.get_cash_report(
        db, dfrom=dfrom, dto=dto, payment_filter=payment_method
    )


@router.get("/salaries", response_model=SalariesReportOut)
async def get_salaries(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: ReportsUser,
    period: Annotated[tuple[date, date], Depends(_period)],
) -> dict:
    dfrom, dto = period
    return await reports_service.get_salaries(db, dfrom=dfrom, dto=dto)


@router.post("/salaries/mark-paid")
async def mark_salary_paid(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: ReportsUser,
    body: MarkSalaryPaidIn,
) -> dict:
    payment = await reports_service.mark_salary_paid(
        db,
        user=user,
        master_id=body.master_id,
        dfrom=body.period_start,
        dto=body.period_end,
        paid_amount=body.paid_amount,
        note=body.note,
    )
    return {"id": str(payment.id), "status": payment.status.value}


@router.get("/salaries/{master_id}/history", response_model=list[SalaryPaymentHistoryOut])
async def salary_history(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: ReportsUser,
    master_id: UUID,
) -> list:
    return await reports_service.get_salary_history(db, master_id=master_id)


@router.get("/expenses", response_model=list[ExpenseOut])
async def list_expenses(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: ReportsUser,
    period: Annotated[tuple[date, date], Depends(_period)],
    category: Annotated[ExpenseCategory | None, Query()] = None,
) -> list:
    dfrom, dto = period
    return await reports_service.list_expenses(db, dfrom=dfrom, dto=dto, category=category)


@router.post("/expenses", response_model=ExpenseOut)
async def create_expense(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: ReportsUser,
    body: ExpenseCreate,
) -> dict:
    exp = await reports_service.create_expense(
        db,
        user=user,
        data=body.model_dump(),
    )
    rows = await reports_service.list_expenses(
        db,
        dfrom=body.date,
        dto=body.date,
    )
    return next((r for r in rows if r["id"] == exp.id), rows[0] if rows else {})


@router.put("/expenses/{expense_id}", response_model=ExpenseOut)
async def update_expense(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: ReportsUser,
    expense_id: UUID,
    body: ExpenseUpdate,
) -> dict:
    exp = await reports_service.update_expense(
        db, expense_id=expense_id, data=body.model_dump(exclude_unset=True)
    )
    rows = await reports_service.list_expenses(db, dfrom=exp.date, dto=exp.date)
    return next((r for r in rows if r["id"] == exp.id), {})


@router.delete("/expenses/{expense_id}", status_code=204)
async def delete_expense(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: ReportsUser,
    expense_id: UUID,
) -> Response:
    await reports_service.delete_expense(db, expense_id=expense_id)
    return Response(status_code=204)


@router.get("/export/pnl")
async def export_pnl(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: ReportsUser,
    period: Annotated[tuple[date, date], Depends(_period)],
    format: Annotated[str, Query()] = "xlsx",
) -> Response:
    dfrom, dto = period
    pnl = await reports_service.get_pnl(db, dfrom=dfrom, dto=dto)
    salon = (await db.execute(select(Salon).limit(1))).scalar_one_or_none()
    name = salon.name if salon and isinstance(salon.name, str) else "Salon"
    label = f"{dfrom} — {dto}"
    if format == "xlsx":
        data = reports_export_service.pnl_to_xlsx(pnl, salon_name=name, period_label=label)
        return Response(
            content=data,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="pnl-{dfrom}-{dto}.xlsx"'},
        )
    raise HTTPException(status_code=400, detail="Unsupported format")


@router.get("/export/salaries")
async def export_salaries(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: ReportsUser,
    period: Annotated[tuple[date, date], Depends(_period)],
    format: Annotated[str, Query()] = "pdf",
) -> Response:
    dfrom, dto = period
    salaries = await reports_service.get_salaries(db, dfrom=dfrom, dto=dto)
    salon = (await db.execute(select(Salon).limit(1))).scalar_one_or_none()
    name = salon.name if salon and isinstance(salon.name, str) else "Salon"
    label = f"{dfrom} — {dto}"
    data = reports_export_service.salaries_to_pdf(salaries, salon_name=name, period_label=label)
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="salaries-{dfrom}-{dto}.pdf"'},
    )


@router.get("/export/cash")
async def export_cash(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: ReportsUser,
    period: Annotated[tuple[date, date], Depends(_period)],
    format: Annotated[str, Query()] = "xlsx",
) -> Response:
    dfrom, dto = period
    report = await reports_service.get_cash_report(db, dfrom=dfrom, dto=dto)
    label = f"{dfrom} — {dto}"
    data = reports_export_service.cash_to_xlsx(report, period_label=label)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="cash-{dfrom}-{dto}.xlsx"'},
    )


# Salary settings on masters router path — mounted via reports_admin_router
salary_router = APIRouter(prefix="/masters", tags=["masters"])


@salary_router.get("/{master_id}/salary-settings", response_model=SalarySettingsOut)
async def get_salary_settings(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: ReportsUser,
    master_id: UUID,
) -> SalarySettingsOut:
    s = await reports_service.get_or_create_salary_settings(db, master_id=master_id)
    return SalarySettingsOut(
        master_id=s.master_id,
        salary_type=s.salary_type,
        percent_value=s.percent_value,
        fixed_amount=s.fixed_amount,
        monthly_norm=s.monthly_norm,
        updated_at=s.updated_at,
    )


@salary_router.put("/{master_id}/salary-settings", response_model=SalarySettingsOut)
async def put_salary_settings(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: ReportsUser,
    master_id: UUID,
    body: SalarySettingsUpdate,
) -> SalarySettingsOut:
    s = await reports_service.update_salary_settings(
        db, master_id=master_id, data=body.model_dump()
    )
    return SalarySettingsOut(
        master_id=s.master_id,
        salary_type=s.salary_type,
        percent_value=s.percent_value,
        fixed_amount=s.fixed_amount,
        monthly_norm=s.monthly_norm,
        updated_at=s.updated_at,
    )


@salary_router.put("/{master_id}/reports-access")
async def set_reports_access(
    db: Annotated[AsyncSession, Depends(get_db)],
    _owner: Annotated[User, Depends(require_roles(UserRole.owner))],
    master_id: UUID,
    body: ReportsAccessUpdate,
) -> dict:
    master = (
        await db.execute(select(Master).where(Master.id == master_id))
    ).scalar_one_or_none()
    if master is None:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Master not found")
    master.reports_access = body.reports_access
    users = (
        await db.execute(select(User).where(User.master_id == master_id, User.role == UserRole.admin))
    ).scalars().all()
    for u in users:
        u.reports_access = body.reports_access
    await db.flush()
    return {"master_id": str(master_id), "reports_access": body.reports_access}
