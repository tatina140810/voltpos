from __future__ import annotations

import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.mixins import TimestampMixin


class PaymentMethod(str, enum.Enum):
    cash = "cash"
    card = "card"
    transfer = "transfer"


class InstallmentPayment(Base, TimestampMixin):
    __tablename__ = "installment_payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    installment_id: Mapped[int] = mapped_column(ForeignKey("installments.id"), nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    payment_method: Mapped[PaymentMethod] = mapped_column(Enum(PaymentMethod), nullable=False, default=PaymentMethod.cash)
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    received_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
