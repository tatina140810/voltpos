from __future__ import annotations

from decimal import Decimal

from sqlalchemy import ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin


class CashWithdrawal(Base, TimestampMixin, SoftDeleteMixin):
    """Выдача наличных из кассы (инкассация). Не путать с продажами или возвратами —
    это уход денег в течение дня (закупка, текущие расходы, выдача владельцу и т.п.)."""

    __tablename__ = "cash_withdrawals"

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    issued_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    recipient: Mapped[str] = mapped_column(String(255), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    reason: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    shift_id: Mapped[int | None] = mapped_column(ForeignKey("shifts.id"), nullable=True, index=True)
    # Какой счёт/касса уменьшается. По умолчанию cash (для обратной совместимости).
    method: Mapped[str] = mapped_column(String(10), nullable=False, default="cash", server_default="cash")
    # Категория движения: inkas (в банк), owner (владельцу), expense (текущий расход),
    # supplier (оплата поставщику — не уменьшает прибыль), other.
    kind: Mapped[str] = mapped_column(String(12), nullable=False, default="expense", server_default="expense")
    # Если kind=supplier — ссылка на поставщика. Иначе NULL.
    supplier_id: Mapped[int | None] = mapped_column(ForeignKey("suppliers.id"), nullable=True, index=True)
