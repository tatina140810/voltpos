from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class InvoiceScanUsage(Base):
    """Счётчик распознанных накладных по магазину за календарный месяц.
    Уникально по (org_id, year_month). Инкрементится в /scan/invoice."""

    __tablename__ = "invoice_scan_usage"
    __table_args__ = (
        UniqueConstraint("org_id", "year_month", name="uq_scan_usage_org_month"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    year_month: Mapped[str] = mapped_column(String(7), nullable=False)  # "YYYY-MM"
    count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
