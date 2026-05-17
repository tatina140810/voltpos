"""Заказы клиентов с предоплатой.

Поток денег:
- При приёме предоплаты деньги физически в кассе, но это НЕ выручка
  (это обязательство магазина перед клиентом). В /reports/summary:
  prepayments_received по методам, БЕЗ влияния на profit/revenue.
  В Z-отчёте смены: prepayments_cash/card/transfer, прибавляются к expected_cash/card/transfer.
- При выдаче заказа создаётся обычная Sale на полную сумму. paid_cash/card/transfer
  Sale = сумма предоплат по методу + доплата по методу. Выручка попадает в день выдачи.
- При отмене создаётся OrderPayment с kind='refund' и отрицательной суммой
  (зеркало deposit). Касса физически уменьшается.
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models.customer import Customer
from app.models.order import Order, OrderPayment
from app.models.product import Product
from app.models.sale import DeliveryType, Sale, SaleStatus
from app.models.sale_item import SaleItem
from app.models.shift import Shift
from app.models.stock import StockMovement, StockMovementType
from app.models.user import User

router = APIRouter(prefix="/orders", tags=["orders"])


def _zero() -> Decimal:
    return Decimal("0")


# ============== Pydantic ==============

class FirstPayment(BaseModel):
    amount: Decimal
    method: str  # cash | card | transfer


class OrderCreate(BaseModel):
    customer_id: int
    title: str
    notes: str | None = None
    total_expected: Decimal | None = None
    first_payment: FirstPayment | None = None  # необязательная первая предоплата


class PaymentIn(BaseModel):
    amount: Decimal
    method: str  # cash | card | transfer


class FulfillItem(BaseModel):
    product_id: int
    quantity: int
    price: Decimal


class FulfillIn(BaseModel):
    items: list[FulfillItem]
    extra_cash: Decimal = Decimal("0")
    extra_card: Decimal = Decimal("0")
    extra_transfer: Decimal = Decimal("0")


# ============== Helpers ==============

async def _open_shift_id(db: AsyncSession, user: User) -> int | None:
    shift = (
        await db.execute(
            select(Shift).where(
                Shift.org_id == user.org_id,
                Shift.cashier_id == user.id,
                Shift.status == "open",
            )
        )
    ).scalar_one_or_none()
    return shift.id if shift else None


def _validate_method(method: str) -> str:
    if method not in ("cash", "card", "transfer"):
        raise HTTPException(status_code=400, detail="method должен быть cash/card/transfer")
    return method


async def _get_order_or_404(db: AsyncSession, order_id: int, org_id: int) -> Order:
    order = (
        await db.execute(
            select(Order).where(Order.id == order_id, Order.org_id == org_id)
        )
    ).scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")
    return order


async def _payments_summary(db: AsyncSession, order_id: int) -> dict[str, Decimal]:
    """Возвращает суммы по методам: cash/card/transfer, total (deposit − refund)."""
    payments = list(
        (
            await db.execute(
                select(OrderPayment).where(OrderPayment.order_id == order_id)
            )
        ).scalars().all()
    )
    out = {"cash": _zero(), "card": _zero(), "transfer": _zero(), "total": _zero()}
    for p in payments:
        sign = Decimal(1) if p.kind == "deposit" else Decimal(-1)
        amt = (p.amount or _zero()) * sign
        if p.method in out:
            out[p.method] += amt
        out["total"] += amt
    return out


def _serialize_order(order: Order, customer_name: str | None, paid: dict[str, Decimal]) -> dict:
    return {
        "id": order.id,
        "customer_id": order.customer_id,
        "customer_name": customer_name,
        "title": order.title,
        "notes": order.notes,
        "total_expected": str(order.total_expected) if order.total_expected else None,
        "status": order.status,
        "created_at": order.created_at.isoformat() if order.created_at else None,
        "fulfilled_at": order.fulfilled_at.isoformat() if order.fulfilled_at else None,
        "cancelled_at": order.cancelled_at.isoformat() if order.cancelled_at else None,
        "sale_id": order.sale_id,
        "paid_cash": str(paid["cash"]),
        "paid_card": str(paid["card"]),
        "paid_transfer": str(paid["transfer"]),
        "paid_total": str(paid["total"]),
        "remaining": str(max(_zero(), (order.total_expected or _zero()) - paid["total"])) if order.total_expected else None,
    }


# ============== Endpoints ==============

@router.get("")
async def list_orders(
    status: str | None = None,
    customer_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict]:
    """Список заказов. Фильтр: status (open/fulfilled/cancelled), customer_id."""
    stmt = select(Order).where(Order.org_id == user.org_id)
    if status:
        stmt = stmt.where(Order.status == status)
    if customer_id:
        stmt = stmt.where(Order.customer_id == customer_id)
    stmt = stmt.order_by(Order.id.desc()).limit(200)
    orders = list((await db.execute(stmt)).scalars().all())

    cust_ids = {o.customer_id for o in orders}
    customers = (
        {
            c.id: c.name
            for c in (
                await db.execute(select(Customer).where(Customer.id.in_(cust_ids)))
            ).scalars().all()
        }
        if cust_ids
        else {}
    )

    out = []
    for order in orders:
        paid = await _payments_summary(db, order.id)
        out.append(_serialize_order(order, customers.get(order.customer_id), paid))
    return out


@router.post("", status_code=201)
async def create_order(
    payload: OrderCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Создать заказ с опциональной первой предоплатой."""
    customer = (
        await db.execute(
            select(Customer).where(
                Customer.id == payload.customer_id,
                Customer.org_id == user.org_id,
                Customer.is_deleted.is_(False),
            )
        )
    ).scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=400, detail="Клиент не найден")
    if not payload.title.strip():
        raise HTTPException(status_code=400, detail="Укажите описание заказа")

    now = datetime.now(timezone.utc)
    order = Order(
        org_id=user.org_id,
        customer_id=payload.customer_id,
        title=payload.title.strip(),
        notes=payload.notes,
        total_expected=payload.total_expected,
        status="open",
        created_at=now,
        updated_at=now,
        created_by=user.id,
    )
    db.add(order)
    await db.flush()

    if payload.first_payment and payload.first_payment.amount > 0:
        _validate_method(payload.first_payment.method)
        shift_id = await _open_shift_id(db, user)
        db.add(OrderPayment(
            order_id=order.id,
            amount=payload.first_payment.amount,
            method=payload.first_payment.method,
            kind="deposit",
            shift_id=shift_id,
            created_by=user.id,
            created_at=now,
        ))

    await db.commit()
    await db.refresh(order)
    paid = await _payments_summary(db, order.id)
    return _serialize_order(order, customer.name, paid)


@router.get("/{order_id}")
async def get_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    order = await _get_order_or_404(db, order_id, user.org_id)
    customer = (
        await db.execute(select(Customer).where(Customer.id == order.customer_id))
    ).scalar_one_or_none()
    paid = await _payments_summary(db, order.id)
    payments = list(
        (
            await db.execute(
                select(OrderPayment).where(OrderPayment.order_id == order.id).order_by(OrderPayment.id)
            )
        ).scalars().all()
    )
    base = _serialize_order(order, customer.name if customer else None, paid)
    base["payments"] = [
        {
            "id": p.id,
            "amount": str(p.amount),
            "method": p.method,
            "kind": p.kind,
            "shift_id": p.shift_id,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }
        for p in payments
    ]
    return base


@router.post("/{order_id}/payments")
async def add_payment(
    order_id: int,
    payload: PaymentIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Внести дополнительную предоплату по открытому заказу."""
    order = await _get_order_or_404(db, order_id, user.org_id)
    if order.status != "open":
        raise HTTPException(status_code=400, detail="Заказ уже закрыт")
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Сумма должна быть больше нуля")
    _validate_method(payload.method)

    shift_id = await _open_shift_id(db, user)
    db.add(OrderPayment(
        order_id=order.id,
        amount=payload.amount,
        method=payload.method,
        kind="deposit",
        shift_id=shift_id,
        created_by=user.id,
        created_at=datetime.now(timezone.utc),
    ))
    order.updated_at = datetime.now(timezone.utc)
    await db.commit()
    paid = await _payments_summary(db, order.id)
    return {"order_id": order.id, "paid": {k: str(v) for k, v in paid.items()}}


@router.post("/{order_id}/fulfill")
async def fulfill_order(
    order_id: int,
    payload: FulfillIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Товар приехал, клиент пришёл. Создаём реальную Sale, списываем товар,
    зачитываем предоплату + берём доплату по методам. Order → fulfilled."""
    order = await _get_order_or_404(db, order_id, user.org_id)
    if order.status != "open":
        raise HTTPException(status_code=400, detail="Заказ уже закрыт")
    if not payload.items:
        raise HTTPException(status_code=400, detail="Добавьте хотя бы одну позицию")

    # Проверка остатков и подсчёт total.
    items_total = _zero()
    products: dict[int, Product] = {}
    for it in payload.items:
        if it.quantity <= 0:
            raise HTTPException(status_code=400, detail="Количество должно быть больше нуля")
        product = (
            await db.execute(
                select(Product).where(
                    Product.id == it.product_id,
                    Product.org_id == user.org_id,
                    Product.is_deleted.is_(False),
                )
            )
        ).scalar_one_or_none()
        if not product:
            raise HTTPException(status_code=404, detail=f"Товар #{it.product_id} не найден")
        products[product.id] = product
        items_total += (it.price or _zero()) * Decimal(it.quantity)

    paid = await _payments_summary(db, order.id)
    extra_total = (payload.extra_cash or _zero()) + (payload.extra_card or _zero()) + (payload.extra_transfer or _zero())
    if paid["total"] + extra_total < items_total:
        raise HTTPException(
            status_code=400,
            detail=f"Не хватает оплаты: предоплата {paid['total']} + доплата {extra_total} < сумма товаров {items_total}",
        )

    # Привязка к смене кассира — для Z-отчёта/auto-shift защиты.
    shift_id = await _open_shift_id(db, user)
    if shift_id is None:
        raise HTTPException(
            status_code=400,
            detail="Сначала откройте смену (выдача заказа = реальная продажа)",
        )

    # Создаём Sale. paid_* = предоплата_по_методу + доплата_по_методу.
    now = datetime.now(timezone.utc)
    sale = Sale(
        org_id=user.org_id,
        customer_id=order.customer_id,
        seller_id=user.id,
        total=items_total,
        paid_cash=paid["cash"] + (payload.extra_cash or _zero()),
        paid_card=paid["card"] + (payload.extra_card or _zero()),
        paid_transfer=paid["transfer"] + (payload.extra_transfer or _zero()),
        delivery_type=DeliveryType.none,
        delivery_price=_zero(),
        status=SaleStatus.completed,
        shift_id=shift_id,
    )
    db.add(sale)
    await db.flush()

    # Позиции + списание со склада.
    for it in payload.items:
        db.add(SaleItem(
            sale_id=sale.id,
            product_id=it.product_id,
            quantity=it.quantity,
            price=it.price,
            discount=_zero(),
        ))
        prod = products[it.product_id]
        is_weighed = getattr(prod, "kind", None) == "weighed"
        db.add(StockMovement(
            org_id=user.org_id,
            product_id=it.product_id,
            quantity=0 if is_weighed else it.quantity,
            quantity_decimal=Decimal(it.quantity) if is_weighed else None,
            type=StockMovementType.out,
            reason=f"Выдача заказа #{order.id}",
            created_by=user.id,
        ))

    # Если была доплата — её можно тоже записать как OrderPayment для трассировки
    # (но в кассу она войдёт через Sale.paid_*, поэтому в /reports/summary
    # prepayments_received мы её НЕ включим — только deposit-записи до fulfillment).
    # Решение: НЕ создавать дополнительный OrderPayment на доплату — она в Sale.
    order.status = "fulfilled"
    order.fulfilled_at = now
    order.sale_id = sale.id
    order.updated_at = now

    await db.commit()
    return {"detail": "Заказ выдан, продажа создана", "sale_id": sale.id, "order_id": order.id}


@router.post("/{order_id}/cancel")
async def cancel_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("owner")),
) -> dict:
    """Отмена заказа. Создаём refund-OrderPayments — зеркало всех deposit'ов.
    Деньги возвращаем клиенту (физически кассир отдаёт)."""
    order = await _get_order_or_404(db, order_id, user.org_id)
    if order.status != "open":
        raise HTTPException(status_code=400, detail="Заказ уже закрыт")

    payments = list(
        (
            await db.execute(
                select(OrderPayment).where(
                    OrderPayment.order_id == order.id,
                    OrderPayment.kind == "deposit",
                )
            )
        ).scalars().all()
    )
    now = datetime.now(timezone.utc)
    shift_id = await _open_shift_id(db, user)
    for p in payments:
        db.add(OrderPayment(
            order_id=order.id,
            amount=p.amount or _zero(),
            method=p.method,
            kind="refund",
            shift_id=shift_id,
            created_by=user.id,
            created_at=now,
        ))
    order.status = "cancelled"
    order.cancelled_at = now
    order.updated_at = now
    await db.commit()
    return {"detail": "Заказ отменён, предоплата возвращена", "order_id": order.id}
