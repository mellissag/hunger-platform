"""Схемы раздела «Отчёты»."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import ExpenseCategory, PaymentMethod, SalaryType


class PeriodQuery(BaseModel):
    period_start: date
    period_end: date


class PnlRevenueOut(BaseModel):
    services: Decimal
    products: Decimal
    total: Decimal


class PnlExpensesOut(BaseModel):
    salaries: Decimal
    rent: Decimal
    utilities: Decimal
    supplies: Decimal
    advertising: Decimal
    equipment: Decimal
    taxes: Decimal
    software: Decimal
    training: Decimal
    other: Decimal
    total: Decimal


class PnlOut(BaseModel):
    period: dict[str, str]
    revenue: PnlRevenueOut
    expenses: PnlExpensesOut
    gross_profit: Decimal
    profit_margin_percent: float
    prev_period_profit: Decimal
    growth_percent: float | None


class CashTransactionOut(BaseModel):
    type: str
    source: str
    amount: Decimal
    cash: Decimal | None = None
    card: Decimal | None = None
    description: str


class CashDayOut(BaseModel):
    date: str
    income: Decimal
    income_cash: Decimal
    income_card: Decimal
    expenses: Decimal
    balance: Decimal
    transactions: list[CashTransactionOut]


class CashSummaryOut(BaseModel):
    total_income: Decimal
    income_cash: Decimal
    income_card: Decimal
    total_expenses: Decimal
    balance: Decimal


class CashReportOut(BaseModel):
    summary: CashSummaryOut
    by_day: list[CashDayOut]


class SalaryMasterRowOut(BaseModel):
    master_id: UUID
    name: str
    salary_type: SalaryType
    revenue: Decimal
    bookings_count: int
    calculated_salary: Decimal
    paid: bool
    payment_id: UUID | None = None


class SalariesReportOut(BaseModel):
    period: dict[str, str]
    masters: list[SalaryMasterRowOut]
    total_calculated: Decimal
    total_paid: Decimal


class MarkSalaryPaidIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    master_id: UUID
    period_start: date
    period_end: date
    paid_amount: Decimal = Field(ge=0)
    note: str | None = None


class SalaryPaymentHistoryOut(BaseModel):
    id: UUID
    period_start: date
    period_end: date
    revenue_amount: Decimal
    calculated_amount: Decimal
    paid_amount: Decimal
    status: str
    note: str | None
    paid_at: datetime | None
    created_at: datetime


class SalarySettingsOut(BaseModel):
    master_id: UUID
    salary_type: SalaryType
    percent_value: Decimal | None = None
    fixed_amount: Decimal | None = None
    monthly_norm: Decimal | None = None
    updated_at: datetime | None = None


class SalarySettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    salary_type: SalaryType
    percent_value: Decimal | None = Field(default=None, ge=0, le=100)
    fixed_amount: Decimal | None = Field(default=None, ge=0)
    monthly_norm: Decimal | None = Field(default=None, ge=0)


class ExpenseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    category: ExpenseCategory
    amount: Decimal
    description: str
    date: date
    created_by_id: UUID
    created_at: datetime
    created_by_name: str | None = None


class ExpenseCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category: ExpenseCategory
    amount: Decimal = Field(gt=0)
    description: str = Field(min_length=1, max_length=2000)
    date: date


class ExpenseUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category: ExpenseCategory | None = None
    amount: Decimal | None = Field(default=None, gt=0)
    description: str | None = Field(default=None, min_length=1, max_length=2000)
    date: date | None = None


class ReportsAccessUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reports_access: bool


class BookingPaymentUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    payment_method: PaymentMethod
    payment_cash: Decimal | None = Field(default=None, ge=0)
    payment_card: Decimal | None = Field(default=None, ge=0)
