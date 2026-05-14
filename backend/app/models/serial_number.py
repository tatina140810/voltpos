from __future__ import annotations

import enum
from datetime import date

from sqlalchemy import Date, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.mixins import TimestampMixin


class SerialStatus(str, enum.Enum):
    in_stock = "in_stock"
    sold = "sold"
    repair = "repair"
    returned = "returned"


class SerialNumber(Base, TimestampMixin):
    __tablename__ = "serial_numbers"

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False, index=True)
    serial: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    status: Mapped[SerialStatus] = mapped_column(Enum(SerialStatus), nullable=False, default=SerialStatus.in_stock)
    purchase_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    sale_id: Mapped[int | None] = mapped_column(ForeignKey("sales.id"), nullable=True)
