from __future__ import annotations

import enum
from datetime import date
from decimal import Decimal

from sqlalchemy import Date, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin


class StockMovementType(str, enum.Enum):
    in_stock = "in"
    out = "out"
    transfer = "transfer"
    writeoff = "writeoff"
    revision = "revision"


class StockMovement(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "stock_movements"

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False, index=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    type: Mapped[StockMovementType] = mapped_column(Enum(StockMovementType), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    supplier: Mapped[str | None] = mapped_column(String(255), nullable=True)
    invoice_number: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    production_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    batch_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Связь с поставщиком (новый FK; старое текстовое поле supplier остаётся для legacy).
    supplier_id: Mapped[int | None] = mapped_column(
        ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Закупочная цена за единицу/кг (для расчёта маржи).
    cost_price: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    # Дробное количество для весовых товаров; для штучных используется quantity.
    quantity_decimal: Mapped[Decimal | None] = mapped_column(Numeric(14, 3), nullable=True)
    # Категория списания (только для type=writeoff). Один из:
    # expired / damaged / theft / own_use / return_to_supplier / other.
    # NULL для legacy-записей и для не-writeoff движений.
    writeoff_reason: Mapped[str | None] = mapped_column(String(20), nullable=True)
