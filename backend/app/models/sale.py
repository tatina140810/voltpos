from __future__ import annotations

import enum
from decimal import Decimal
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin


class DeliveryType(str, enum.Enum):
    none = "none"
    included = "included"
    separate = "separate"


class SaleStatus(str, enum.Enum):
    completed = "completed"
    debt = "debt"
    installment = "installment"
    returned = "returned"


class Sale(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "sales"

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id"), nullable=True, index=True)
    seller_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    paid_cash: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    paid_card: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    paid_transfer: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    delivery_type: Mapped[DeliveryType] = mapped_column(Enum(DeliveryType), nullable=False, default=DeliveryType.none)
    delivery_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    delivery_address: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    delivery_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Дата, до которой клиент пообещал погасить долг. Используется для напоминаний владельцу.
    promised_payment_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    # Кассовая смена, в которой создана продажа. Nullable: продажи без открытой смены тоже работают.
    shift_id: Mapped[int | None] = mapped_column(ForeignKey("shifts.id"), nullable=True, index=True)
    installation: Mapped[bool] = mapped_column(default=False)
    installation_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    status: Mapped[SaleStatus] = mapped_column(Enum(SaleStatus), nullable=False, default=SaleStatus.completed)
    offline_id: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True, index=True)
    synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
