from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.mixins import TimestampMixin


class Shift(Base, TimestampMixin):
    """Кассовая смена. Открывается в начале дня (с указанием стартовой суммы наличных),
    закрывается в конце с пересчётом фактической суммы. Привязка к продажам и инкассации
    через nullable FK Sale.shift_id и CashWithdrawal.shift_id."""

    __tablename__ = "shifts"

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    cashier_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    opening_cash: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"))
    closing_cash_actual: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="open")  # open|closed
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Снимок итогов на момент закрытия — Z-отчёт «замораживается» и не зависит
    # от позднейших возвратов в новой смене.
    totals_snapshot: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
