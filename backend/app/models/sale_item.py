from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin


class SaleItem(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "sale_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id"), nullable=False, index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False, index=True)
    serial_id: Mapped[int | None] = mapped_column(ForeignKey("serial_numbers.id"), nullable=True, index=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    discount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    weight_grams: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Защита от двойного возврата: при первом возврате ставится timestamp,
    # повторный POST /sales/{id}/return на ту же позицию игнорирует её.
    returned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
