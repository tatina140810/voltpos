from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Numeric, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.mixins import TimestampMixin


class PeriodExpense(Base, TimestampMixin):
    """Сохранённые «прочие расходы» и зарплата для одного выбранного периода в отчёте.
    Уникально по (org_id, period_from, period_to). При сохранении upsert."""

    __tablename__ = "period_expenses"
    __table_args__ = (
        UniqueConstraint("org_id", "period_from", "period_to", name="uq_period_expense_period"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    period_from: Mapped[date] = mapped_column(Date, nullable=False)
    period_to: Mapped[date] = mapped_column(Date, nullable=False)
    salary: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    other_expenses: Mapped[list | None] = mapped_column(JSONB, nullable=True)
