from __future__ import annotations

import enum
from datetime import date, time

from sqlalchemy import Date, Enum, ForeignKey, String, Text, Time
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin


class DeliveryStatus(str, enum.Enum):
    scheduled = "scheduled"
    in_transit = "in_transit"
    delivered = "delivered"
    failed = "failed"


class Delivery(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "deliveries"

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id"), nullable=False, index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), nullable=False, index=True)
    address: Mapped[str] = mapped_column(String(1024), nullable=False)
    scheduled_date: Mapped[date] = mapped_column(Date, nullable=False)
    scheduled_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    driver_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    status: Mapped[DeliveryStatus] = mapped_column(Enum(DeliveryStatus), nullable=False, default=DeliveryStatus.scheduled)
    photo_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
