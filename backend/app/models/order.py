from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Order(Base):
    """Клиентский заказ с предоплатой.
    Жизненный цикл: open → fulfilled (товар выдан, создана Sale) или cancelled (деньги вернули).
    Предоплаты могут вноситься частями (см. OrderPayment), без жёсткой привязки к товару
    в момент приёма — кассир пишет свободное описание ("Холодильник Samsung RB37")."""

    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Ожидаемая полная сумма (если известна заранее). При финализации фактическая
    # сумма берётся из позиций Sale, не из этого поля.
    total_expected: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="open")  # open|fulfilled|cancelled
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    fulfilled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sale_id: Mapped[int | None] = mapped_column(ForeignKey("sales.id"), nullable=True, index=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class OrderPayment(Base):
    """Платёж по заказу: либо deposit (внесение), либо refund (возврат при отмене).
    Привязка к смене (shift_id) нужна для Z-отчёта."""

    __tablename__ = "order_payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    method: Mapped[str] = mapped_column(String(10), nullable=False)  # cash|card|transfer
    kind: Mapped[str] = mapped_column(String(10), nullable=False, default="deposit")  # deposit|refund
    shift_id: Mapped[int | None] = mapped_column(ForeignKey("shifts.id"), nullable=True, index=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
