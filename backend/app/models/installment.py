from __future__ import annotations

import enum
from datetime import date
from decimal import Decimal

from sqlalchemy import Date, Enum, ForeignKey, Numeric
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin


class InstallmentStatus(str, enum.Enum):
    active = "active"
    completed = "completed"
    overdue = "overdue"


class Installment(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "installments"

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id"), nullable=False, index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), nullable=False, index=True)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    paid_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    monthly_payment: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    next_payment_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[InstallmentStatus] = mapped_column(Enum(InstallmentStatus), nullable=False, default=InstallmentStatus.active)
