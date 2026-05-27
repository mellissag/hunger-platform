"""Бизнес-логика финансовых отчётов: P&L, касса, зарплаты, расходы."""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import NotFoundError
from app.models.booking import Booking
from app.models.enums import (
    BookingStatus,
    ExpenseCategory,
    PaymentMethod,
    SalaryPaymentStatus,
    SalaryType,
)
from app.models.inventory import SupplyInvoice
from app.models.master import Master
from app.models.reports import Expense, SalaryPayment, SalarySettings
from app.models.user import User
from app.services.stats_common import period_utc_range


def _d(v: object) -> Decimal:
    return Decimal(str(v or 0)).quantize(Decimal("0.01"))


def calculate_salary(
    *,
    salary_type: SalaryType,
    revenue: Decimal,
    percent_value: Decimal | None,
    fixed_amount: Decimal | None,
    monthly_norm: Decimal | None,
) -> Decimal:
    if salary_type == SalaryType.fixed:
        return _d(fixed_amount)
    if salary_type == SalaryType.percent:
        pct = _d(percent_value)
        return _d(revenue * pct / Decimal("100"))
    base = _d(fixed_amount)
    norm = _d(monthly_norm)
    pct = _d(percent_value)
    if revenue <= norm:
        return base
    return _d(base + (revenue - norm) * pct / Decimal("100"))


async def _booking_revenue(
    db: AsyncSession, *, start: datetime, end: datetime
) -> Decimal:
    row = (
        await db.execute(
            select(func.coalesce(func.sum(Booking.price), 0)).where(
                Booking.status == BookingStatus.completed,
                Booking.starts_at >= start,
                Booking.starts_at < end,
            )
        )
    ).scalar_one()
    return _d(row)


async def _expenses_by_category(
    db: AsyncSession, *, dfrom: date, dto: date
) -> dict[ExpenseCategory, Decimal]:
    rows = (
        await db.execute(
            select(Expense.category, func.coalesce(func.sum(Expense.amount), 0))
            .where(Expense.date >= dfrom, Expense.date <= dto)
            .group_by(Expense.category)
        )
    ).all()
    return {cat: _d(amt) for cat, amt in rows}


async def _supply_expenses(db: AsyncSession, *, start: datetime, end: datetime) -> Decimal:
    row = (
        await db.execute(
            select(func.coalesce(func.sum(SupplyInvoice.total_cost), 0)).where(
                SupplyInvoice.arrived_at >= start,
                SupplyInvoice.arrived_at < end,
            )
        )
    ).scalar_one()
    return _d(row)


async def _salary_expenses(db: AsyncSession, *, dfrom: date, dto: date) -> Decimal:
    row = (
        await db.execute(
            select(func.coalesce(func.sum(SalaryPayment.calculated_amount), 0)).where(
                SalaryPayment.period_start >= dfrom,
                SalaryPayment.period_end <= dto,
            )
        )
    ).scalar_one()
    return _d(row)


def _prev_period(dfrom: date, dto: date) -> tuple[date, date]:
    days = (dto - dfrom).days + 1
    prev_end = dfrom - timedelta(days=1)
    prev_start = prev_end - timedelta(days=days - 1)
    return prev_start, prev_end


async def get_pnl(
    db: AsyncSession, *, dfrom: date, dto: date
) -> dict:
    start, end = period_utc_range(dfrom, dto)
    services_rev = await _booking_revenue(db, start=start, end=end)
    products_rev = Decimal("0.00")
    total_rev = _d(services_rev + products_rev)

    by_cat = await _expenses_by_category(db, dfrom=dfrom, dto=dto)
    supplies_inv = await _supply_expenses(db, start=start, end=end)
    supplies_manual = by_cat.get(ExpenseCategory.supplies, Decimal("0"))
    supplies_total = _d(supplies_manual + supplies_inv)

    salaries = await _salary_expenses(db, dfrom=dfrom, dto=dto)
    if salaries == 0:
        salaries = await _compute_total_salaries(db, dfrom=dfrom, dto=dto)

    exp = {
        "salaries": salaries,
        "rent": by_cat.get(ExpenseCategory.rent, Decimal("0")),
        "utilities": by_cat.get(ExpenseCategory.utilities, Decimal("0")),
        "supplies": supplies_total,
        "advertising": by_cat.get(ExpenseCategory.advertising, Decimal("0")),
        "equipment": by_cat.get(ExpenseCategory.equipment, Decimal("0")),
        "taxes": by_cat.get(ExpenseCategory.taxes, Decimal("0")),
        "software": by_cat.get(ExpenseCategory.software, Decimal("0")),
        "training": by_cat.get(ExpenseCategory.training, Decimal("0")),
        "other": _d(
            by_cat.get(ExpenseCategory.other, Decimal("0"))
            + by_cat.get(ExpenseCategory.salary_bonus, Decimal("0"))
        ),
    }
    exp_total = _d(sum(exp.values()))
    gross = _d(total_rev - exp_total)
    margin = float(gross / total_rev * 100) if total_rev > 0 else 0.0

    p_start, p_end = _prev_period(dfrom, dto)
    prev_start, prev_end = period_utc_range(p_start, p_end)
    prev_rev = await _booking_revenue(db, start=prev_start, end=prev_end)
    prev_by = await _expenses_by_category(db, dfrom=p_start, dto=p_end)
    prev_sup = await _supply_expenses(db, start=prev_start, end=prev_end)
    prev_sal = await _salary_expenses(db, dfrom=p_start, dto=p_end)
    if prev_sal == 0:
        prev_sal = await _compute_total_salaries(db, dfrom=p_start, dto=p_end)
    prev_exp = _d(
        prev_sal
        + sum(prev_by.values())
        + prev_sup
    )
    prev_profit = _d(prev_rev - prev_exp)
    growth = float((gross - prev_profit) / prev_profit * 100) if prev_profit != 0 else None

    return {
        "period": {"start": dfrom.isoformat(), "end": dto.isoformat()},
        "revenue": {
            "services": services_rev,
            "products": products_rev,
            "total": total_rev,
        },
        "expenses": {**exp, "total": exp_total},
        "gross_profit": gross,
        "profit_margin_percent": round(margin, 1),
        "prev_period_profit": prev_profit,
        "growth_percent": round(growth, 1) if growth is not None else None,
    }


async def _compute_total_salaries(db: AsyncSession, *, dfrom: date, dto: date) -> Decimal:
    report = await get_salaries(db, dfrom=dfrom, dto=dto)
    return _d(report["total_calculated"])


async def get_salaries(db: AsyncSession, *, dfrom: date, dto: date) -> dict:
    start, end = period_utc_range(dfrom, dto)
    masters = (await db.execute(select(Master).order_by(Master.sort_order))).scalars().all()
    rows: list[dict] = []
    total_calc = Decimal("0")
    total_paid = Decimal("0")

    for m in masters:
        rev_row = (
            await db.execute(
                select(func.coalesce(func.sum(Booking.price), 0)).where(
                    Booking.master_id == m.id,
                    Booking.status == BookingStatus.completed,
                    Booking.starts_at >= start,
                    Booking.starts_at < end,
                )
            )
        ).scalar_one()
        revenue = _d(rev_row)
        n_bookings = int(
            (
                await db.execute(
                    select(func.count())
                    .select_from(Booking)
                    .where(
                        Booking.master_id == m.id,
                        Booking.status == BookingStatus.completed,
                        Booking.starts_at >= start,
                        Booking.starts_at < end,
                    )
                )
            ).scalar_one()
            or 0
        )

        settings = (
            await db.execute(select(SalarySettings).where(SalarySettings.master_id == m.id))
        ).scalar_one_or_none()
        if settings:
            st = settings.salary_type
            calc = calculate_salary(
                salary_type=st,
                revenue=revenue,
                percent_value=settings.percent_value,
                fixed_amount=settings.fixed_amount,
                monthly_norm=settings.monthly_norm,
            )
        else:
            st = SalaryType.percent
            calc = _d(revenue * _d(m.payroll_percent) / Decimal("100"))

        payment = (
            await db.execute(
                select(SalaryPayment)
                .where(
                    SalaryPayment.master_id == m.id,
                    SalaryPayment.period_start == dfrom,
                    SalaryPayment.period_end == dto,
                    SalaryPayment.status == SalaryPaymentStatus.paid,
                )
                .limit(1)
            )
        ).scalar_one_or_none()

        paid = payment is not None
        if paid and payment:
            total_paid += _d(payment.paid_amount)
        total_calc += calc

        rows.append(
            {
                "master_id": m.id,
                "name": m.display_name,
                "salary_type": st,
                "revenue": revenue,
                "bookings_count": n_bookings,
                "calculated_salary": calc,
                "paid": paid,
                "payment_id": payment.id if payment else None,
            }
        )

    return {
        "period": {"start": dfrom.isoformat(), "end": dto.isoformat()},
        "masters": rows,
        "total_calculated": total_calc,
        "total_paid": total_paid,
    }


async def mark_salary_paid(
    db: AsyncSession,
    *,
    user: User,
    master_id: UUID,
    dfrom: date,
    dto: date,
    paid_amount: Decimal,
    note: str | None,
) -> SalaryPayment:
    master = (
        await db.execute(select(Master).where(Master.id == master_id))
    ).scalar_one_or_none()
    if master is None:
        raise NotFoundError("Master not found")

    salaries = await get_salaries(db, dfrom=dfrom, dto=dto)
    row = next((r for r in salaries["masters"] if r["master_id"] == master_id), None)
    calc = row["calculated_salary"] if row else paid_amount
    rev = row["revenue"] if row else Decimal("0")

    existing = (
        await db.execute(
            select(SalaryPayment).where(
                SalaryPayment.master_id == master_id,
                SalaryPayment.period_start == dfrom,
                SalaryPayment.period_end == dto,
            )
        )
    ).scalar_one_or_none()

    if existing:
        existing.paid_amount = paid_amount
        existing.calculated_amount = calc
        existing.revenue_amount = rev
        existing.status = SalaryPaymentStatus.paid
        existing.note = note
        existing.paid_at = datetime.now(UTC)
        await db.flush()
        return existing

    payment = SalaryPayment(
        master_id=master_id,
        period_start=dfrom,
        period_end=dto,
        revenue_amount=rev,
        calculated_amount=calc,
        paid_amount=paid_amount,
        status=SalaryPaymentStatus.paid,
        note=note,
        paid_at=datetime.now(UTC),
        created_by_id=user.id,
    )
    db.add(payment)
    await db.flush()
    return payment


async def get_salary_history(db: AsyncSession, *, master_id: UUID) -> list[SalaryPayment]:
    result = await db.execute(
        select(SalaryPayment)
        .where(SalaryPayment.master_id == master_id)
        .order_by(SalaryPayment.period_start.desc())
    )
    return list(result.scalars().all())


async def get_or_create_salary_settings(
    db: AsyncSession, *, master_id: UUID
) -> SalarySettings:
    row = (
        await db.execute(select(SalarySettings).where(SalarySettings.master_id == master_id))
    ).scalar_one_or_none()
    if row:
        return row
    master = (
        await db.execute(select(Master).where(Master.id == master_id))
    ).scalar_one_or_none()
    if master is None:
        raise NotFoundError("Master not found")
    row = SalarySettings(
        master_id=master_id,
        salary_type=SalaryType.percent,
        percent_value=master.payroll_percent,
    )
    db.add(row)
    await db.flush()
    return row


async def update_salary_settings(
    db: AsyncSession, *, master_id: UUID, data: dict
) -> SalarySettings:
    settings = await get_or_create_salary_settings(db, master_id=master_id)
    for k, v in data.items():
        if v is not None or k == "salary_type":
            setattr(settings, k, v)
    await db.flush()
    return settings


def _payment_split(booking: Booking) -> tuple[Decimal, Decimal]:
    price = _d(booking.price)
    if booking.payment_method == PaymentMethod.cash:
        return price, Decimal("0")
    if booking.payment_method == PaymentMethod.card:
        return Decimal("0"), price
    if booking.payment_method == PaymentMethod.mixed:
        return _d(booking.payment_cash), _d(booking.payment_card)
    return Decimal("0"), Decimal("0")


async def get_cash_report(
    db: AsyncSession,
    *,
    dfrom: date,
    dto: date,
    payment_filter: str = "all",
) -> dict:
    start, end = period_utc_range(dfrom, dto)
    bookings = (
        await db.execute(
            select(Booking).where(
                Booking.status == BookingStatus.completed,
                Booking.starts_at >= start,
                Booking.starts_at < end,
            )
        )
    ).scalars().all()

    expenses = (
        await db.execute(
            select(Expense).where(Expense.date >= dfrom, Expense.date <= dto)
        )
    ).scalars().all()

    by_day: dict[date, dict] = defaultdict(
        lambda: {
            "income": Decimal("0"),
            "income_cash": Decimal("0"),
            "income_card": Decimal("0"),
            "expenses": Decimal("0"),
            "transactions": [],
            "bookings": [],
        }
    )

    for b in bookings:
        day = b.starts_at.date() if b.starts_at else dfrom
        cash, card = _payment_split(b)
        if payment_filter == "cash" and cash == 0:
            continue
        if payment_filter == "card" and card == 0:
            continue
        by_day[day]["income"] += _d(b.price)
        by_day[day]["income_cash"] += cash
        by_day[day]["income_card"] += card
        by_day[day]["bookings"].append(b)

    for e in expenses:
        by_day[e.date]["expenses"] += _d(e.amount)
        by_day[e.date]["transactions"].append(
            {
                "type": "expense",
                "source": e.category.value,
                "amount": _d(e.amount),
                "description": e.description,
            }
        )

    total_income = Decimal("0")
    total_cash = Decimal("0")
    total_card = Decimal("0")
    total_expenses = Decimal("0")
    days_out: list[dict] = []

    for day in sorted(by_day.keys(), reverse=True):
        d = by_day[day]
        n = len(d["bookings"])
        if n > 0:
            d["transactions"].insert(
                0,
                {
                    "type": "income",
                    "source": "booking",
                    "amount": d["income"],
                    "cash": d["income_cash"],
                    "card": d["income_card"],
                    "description": f"{n} bookings",
                },
            )
        balance = _d(d["income"] - d["expenses"])
        total_income += d["income"]
        total_cash += d["income_cash"]
        total_card += d["income_card"]
        total_expenses += d["expenses"]
        days_out.append(
            {
                "date": day.isoformat(),
                "income": d["income"],
                "income_cash": d["income_cash"],
                "income_card": d["income_card"],
                "expenses": d["expenses"],
                "balance": balance,
                "transactions": d["transactions"],
            }
        )

    return {
        "summary": {
            "total_income": _d(total_income),
            "income_cash": _d(total_cash),
            "income_card": _d(total_card),
            "total_expenses": _d(total_expenses),
            "balance": _d(total_income - total_expenses),
        },
        "by_day": days_out,
    }


async def list_expenses(
    db: AsyncSession,
    *,
    dfrom: date,
    dto: date,
    category: ExpenseCategory | None = None,
) -> list[dict]:
    q = (
        select(Expense, User.first_name, User.last_name)
        .join(User, Expense.created_by_id == User.id)
        .where(Expense.date >= dfrom, Expense.date <= dto)
        .order_by(Expense.date.desc(), Expense.created_at.desc())
    )
    if category:
        q = q.where(Expense.category == category)
    rows = (await db.execute(q)).all()
    out: list[dict] = []
    for exp, fn, ln in rows:
        name = f"{fn} {ln or ''}".strip()
        out.append(
            {
                "id": exp.id,
                "category": exp.category,
                "amount": exp.amount,
                "description": exp.description,
                "date": exp.date,
                "created_by_id": exp.created_by_id,
                "created_at": exp.created_at,
                "created_by_name": name,
            }
        )
    return out


async def create_expense(db: AsyncSession, *, user: User, data: dict) -> Expense:
    exp = Expense(created_by_id=user.id, **data)
    db.add(exp)
    await db.flush()
    return exp


async def update_expense(db: AsyncSession, *, expense_id: UUID, data: dict) -> Expense:
    exp = (
        await db.execute(select(Expense).where(Expense.id == expense_id))
    ).scalar_one_or_none()
    if exp is None:
        raise NotFoundError("Expense not found")
    for k, v in data.items():
        if v is not None:
            setattr(exp, k, v)
    await db.flush()
    return exp


async def delete_expense(db: AsyncSession, *, expense_id: UUID) -> None:
    exp = (
        await db.execute(select(Expense).where(Expense.id == expense_id))
    ).scalar_one_or_none()
    if exp is None:
        raise NotFoundError("Expense not found")
    await db.delete(exp)
