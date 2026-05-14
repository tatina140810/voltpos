from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.customer import Customer
from app.models.sale import DeliveryType, Sale
from app.models.user import User

router = APIRouter(prefix="/deliveries", tags=["deliveries"])


def _zero() -> Decimal:
    return Decimal("0.00")


def _paid(s: Sale) -> Decimal:
    return (s.paid_cash or _zero()) + (s.paid_card or _zero()) + (s.paid_transfer or _zero())


@router.get("")
async def list_deliveries(
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """История продаж с доставкой за период.
    Возвращает плоский список + агрегаты для шапки страницы."""
    stmt = (
        select(Sale, Customer.name)
        .outerjoin(Customer, Sale.customer_id == Customer.id)
        .where(
            Sale.org_id == user.org_id,
            Sale.is_deleted.is_(False),
            Sale.delivery_type != DeliveryType.none,
        )
    )
    if from_:
        stmt = stmt.where(func.date(Sale.created_at) >= from_)
    if to:
        stmt = stmt.where(func.date(Sale.created_at) <= to)
    stmt = stmt.order_by(Sale.created_at.desc())

    rows = (await db.execute(stmt)).all()

    items = []
    sum_sales = _zero()
    sum_delivery_fee = _zero()
    for sale, customer_name in rows:
        items.append({
            "id": sale.id,
            "created_at": sale.created_at.isoformat() if sale.created_at else None,
            "delivery_date": sale.delivery_date.isoformat() if sale.delivery_date else None,
            "delivery_type": sale.delivery_type.value,
            "delivery_address": sale.delivery_address,
            "delivery_price": str(sale.delivery_price or _zero()),
            "customer_name": customer_name,
            "sale_total": str(sale.total or _zero()),
            "paid_total": str(_paid(sale)),
            "status": sale.status.value,
        })
        sum_sales += sale.total or _zero()
        sum_delivery_fee += sale.delivery_price or _zero()

    return {
        "items": items,
        "summary": {
            "count": len(items),
            "sum_sales": str(sum_sales),
            "sum_delivery_fee": str(sum_delivery_fee),
        },
    }
