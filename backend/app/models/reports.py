"""Финансовые отчёты: расходы, настройки и выплаты зарплат."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, Text, UniqueConstraint, Uuid, func
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import ExpenseCategory, SalaryPaymentStatus, SalaryType
from app.models.mixins import CreatedAtMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.master import Master
    from app.models.user import User


class Expense(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "expense"

    category: Mapped[ExpenseCategory] = mapped_column(
        SQLEnum(
            ExpenseCategory,
            name="expense_category",
            native_enum=True,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=False,
    )

    created_by: Mapped["User"] = relationship("User", foreign_keys=[created_by_id])


class SalarySettings(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "salary_settings"

    __table_args__ = (UniqueConstraint("master_id", name="uq_salary_settings_master_id"),)

    master_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("master.id", ondelete="CASCADE"),
        nullable=False,
    )
    salary_type: Mapped[SalaryType] = mapped_column(
        SQLEnum(
            SalaryType,
            name="salary_type",
            native_enum=True,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
        default=SalaryType.percent,
    )
    percent_value: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    fixed_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    monthly_norm: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    master: Mapped["Master"] = relationship("Master", back_populates="salary_settings")


class SalaryPayment(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "salary_payment"

    master_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("master.id", ondelete="CASCADE"),
        nullable=False,
    )
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    revenue_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    calculated_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    paid_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    status: Mapped[SalaryPaymentStatus] = mapped_column(
        SQLEnum(
            SalaryPaymentStatus,
            name="salary_payment_status",
            native_enum=True,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
        default=SalaryPaymentStatus.calculated,
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=False,
    )

    master: Mapped["Master"] = relationship("Master", back_populates="salary_payments")
    created_by: Mapped["User"] = relationship("User", foreign_keys=[created_by_id])
