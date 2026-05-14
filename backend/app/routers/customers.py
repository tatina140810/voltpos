from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models.customer import Customer
from app.models.debt_payment import DebtPayment
from app.models.sale import Sale, SaleStatus
from app.models.user import User
from app.schemas.customer import (
    CustomerCreate,
    CustomerDebtPayment,
    CustomerDetails,
    CustomerListItem,
    CustomerOut,
    CustomerSaleHistoryItem,
    CustomerStats,
    CustomerUpdate,
)

router = APIRouter(prefix="/customers", tags=["customers"])


@router.get("", response_model=list[CustomerListItem])
async def list_customers(
    search: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[CustomerListItem]:
    stmt = select(Customer).where(Customer.is_deleted.is_(False))
    if search:
        stmt = stmt.where(or_(Customer.name.ilike(f"%{search}%"), Customer.phone.ilike(f"%{search}%")))
    customers = list((await db.execute(stmt.order_by(Customer.id.desc()))).scalars().all())
    if not customers:
        return []

    customer_ids = [c.id for c in customers]

    # Number of sales per customer (any status, not deleted).
    count_rows = (
        await db.execute(
            select(Sale.customer_id, func.count(Sale.id))
            .where(Sale.customer_id.in_(customer_ids), Sale.is_deleted.is_(False))
            .group_by(Sale.customer_id)
        )
    ).all()
    counts = {cid: int(cnt) for cid, cnt in count_rows}

    # Outstanding debt and the oldest debt date per customer (only debt-status sales).
    debt_sales = list(
        (
            await db.execute(
                select(Sale).where(
                    Sale.customer_id.in_(customer_ids),
                    Sale.status == SaleStatus.debt,
                    Sale.is_deleted.is_(False),
                )
            )
        ).scalars().all()
    )
    debts: dict[int, Decimal] = {}
    oldest_debt: dict[int, datetime] = {}
    for s in debt_sales:
        paid = (s.paid_cash or Decimal("0.00")) + (s.paid_card or Decimal("0.00")) + (s.paid_transfer or Decimal("0.00"))
        outstanding = max(Decimal("0.00"), s.total - paid)
        if outstanding > 0:
            debts[s.customer_id] = debts.get(s.customer_id, Decimal("0.00")) + outstanding
            if s.customer_id not in oldest_debt or s.created_at < oldest_debt[s.customer_id]:
                oldest_debt[s.customer_id] = s.created_at

    return [
        CustomerListItem(
            id=c.id,
            name=c.name,
            phone=c.phone,
            address=c.address,
            discount_percent=c.discount_percent,
            notes=c.notes,
            purchase_count=counts.get(c.id, 0),
            debt_amount=debts.get(c.id, Decimal("0.00")),
            oldest_debt_date=oldest_debt.get(c.id),
        )
        for c in customers
    ]


@router.post("", response_model=CustomerOut)
async def create_customer(
    payload: CustomerCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
) -> Customer:
    customer = Customer(org_id=current_user.org_id, **payload.model_dump())
    db.add(customer)
    await db.commit()
    await db.refresh(customer)
    return customer


@router.get("/phone/{phone}", response_model=CustomerOut)
async def by_phone(phone: str, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)) -> Customer:
    customer = (
        await db.execute(select(Customer).where(Customer.phone == phone, Customer.is_deleted.is_(False)))
    ).scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail="Клиент не найден")
    return customer


@router.get("/{customer_id}", response_model=CustomerOut)
async def get_customer(
    customer_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)
) -> Customer:
    customer = (
        await db.execute(select(Customer).where(Customer.id == customer_id, Customer.is_deleted.is_(False)))
    ).scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail="Клиент не найден")
    return customer


@router.get("/{customer_id}/details", response_model=CustomerDetails)
async def customer_details(
    customer_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)
) -> CustomerDetails:
    customer = (
        await db.execute(select(Customer).where(Customer.id == customer_id, Customer.is_deleted.is_(False)))
    ).scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail="Клиент не найден")

    sales = list(
        (
            await db.execute(
                select(Sale)
                .where(Sale.customer_id == customer_id, Sale.is_deleted.is_(False))
                .order_by(Sale.id.desc())
            )
        ).scalars().all()
    )

    purchases_count = len(sales)
    purchases_total = sum((s.total for s in sales), start=Decimal("0.00"))
    debt_amount = Decimal("0.00")
    for s in sales:
        if s.status == SaleStatus.debt:
            paid = (s.paid_cash or Decimal("0.00")) + (s.paid_card or Decimal("0.00")) + (s.paid_transfer or Decimal("0.00"))
            debt_amount += max(Decimal("0.00"), s.total - paid)

    return CustomerDetails(
        customer=CustomerOut.model_validate(customer),
        stats=CustomerStats(
            purchases_count=purchases_count,
            purchases_total=purchases_total,
            debt_amount=debt_amount,
        ),
        recent_purchases=[
            CustomerSaleHistoryItem(
                id=s.id, created_at=s.created_at, total=s.total, status=s.status.value
            )
            for s in sales[:10]
        ],
    )


@router.put("/{customer_id}", response_model=CustomerOut)
async def update_customer(
    customer_id: int,
    payload: CustomerUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Customer:
    customer = (
        await db.execute(select(Customer).where(Customer.id == customer_id, Customer.is_deleted.is_(False)))
    ).scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail="Клиент не найден")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(customer, field, value)
    await db.commit()
    await db.refresh(customer)
    return customer


@router.post("/{customer_id}/pay-debt")
async def pay_debt(
    customer_id: int,
    payload: CustomerDebtPayment,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    if payload.method not in ("cash", "card", "transfer"):
        raise HTTPException(status_code=400, detail="Метод оплаты должен быть cash, card или transfer")
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Сумма должна быть больше нуля")

    customer = (
        await db.execute(select(Customer).where(Customer.id == customer_id, Customer.is_deleted.is_(False)))
    ).scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail="Клиент не найден")

    debt_sales = list(
        (
            await db.execute(
                select(Sale)
                .where(
                    Sale.customer_id == customer_id,
                    Sale.is_deleted.is_(False),
                    Sale.status == SaleStatus.debt,
                )
                .order_by(Sale.id.asc())
            )
        ).scalars().all()
    )

    remaining = payload.amount
    applied = Decimal("0.00")
    for sale in debt_sales:
        if remaining <= 0:
            break
        paid_total = (sale.paid_cash or Decimal("0.00")) + (sale.paid_card or Decimal("0.00")) + (sale.paid_transfer or Decimal("0.00"))
        sale_debt = sale.total - paid_total
        if sale_debt <= 0:
            sale.status = SaleStatus.completed
            continue
        portion = min(remaining, sale_debt)
        if payload.method == "cash":
            sale.paid_cash = (sale.paid_cash or Decimal("0.00")) + portion
        elif payload.method == "card":
            sale.paid_card = (sale.paid_card or Decimal("0.00")) + portion
        else:
            sale.paid_transfer = (sale.paid_transfer or Decimal("0.00")) + portion
        if portion >= sale_debt:
            sale.status = SaleStatus.completed
        # Запись в историю погашений — одна на каждую затронутую продажу.
        db.add(
            DebtPayment(
                org_id=current_user.org_id,
                customer_id=customer.id,
                sale_id=sale.id,
                amount=portion,
                method=payload.method,
                comment=payload.comment,
                created_by_id=current_user.id,
            )
        )
        applied += portion
        remaining -= portion

    await db.commit()
    return {"applied": str(applied), "change": str(remaining)}


@router.get("/{customer_id}/payment-history")
async def customer_payment_history(
    customer_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """История всех погашений долга клиентом + список продаж в долг с остатками."""
    customer = (
        await db.execute(
            select(Customer).where(Customer.id == customer_id, Customer.is_deleted.is_(False))
        )
    ).scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail="Клиент не найден")

    payments = list(
        (
            await db.execute(
                select(DebtPayment, User.name)
                .outerjoin(User, User.id == DebtPayment.created_by_id)
                .where(DebtPayment.customer_id == customer_id)
                .order_by(DebtPayment.created_at.desc())
            )
        ).all()
    )

    debt_sales = list(
        (
            await db.execute(
                select(Sale)
                .where(
                    Sale.customer_id == customer_id,
                    Sale.is_deleted.is_(False),
                    Sale.status == SaleStatus.debt,
                )
                .order_by(Sale.id.asc())
            )
        ).scalars().all()
    )

    total_debt = Decimal("0.00")
    sales_with_debt = []
    for s in debt_sales:
        paid = (s.paid_cash or Decimal("0.00")) + (s.paid_card or Decimal("0.00")) + (s.paid_transfer or Decimal("0.00"))
        remaining = s.total - paid
        if remaining > 0:
            total_debt += remaining
        sales_with_debt.append(
            {
                "id": s.id,
                "date": s.created_at.isoformat() if s.created_at else None,
                "total": float(s.total),
                "paid": float(paid),
                "remaining_debt": float(remaining),
                "promised_payment_date": s.promised_payment_date.isoformat() if s.promised_payment_date else None,
            }
        )

    return {
        "customer": {
            "id": customer.id,
            "name": customer.name,
            "phone": customer.phone,
            "total_debt": float(total_debt),
        },
        "payments": [
            {
                "id": p.id,
                "amount": float(p.amount),
                "method": p.method,
                "comment": p.comment,
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "created_by": user_name,
                "sale_id": p.sale_id,
            }
            for p, user_name in payments
        ],
        "sales_with_debt": sales_with_debt,
    }


@router.delete("/{customer_id}")
async def delete_customer(
    customer_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(require_role("owner"))
) -> dict:
    customer = (
        await db.execute(select(Customer).where(Customer.id == customer_id, Customer.is_deleted.is_(False)))
    ).scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail="Клиент не найден")
    customer.is_deleted = True
    customer.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return {"detail": "Клиент удалён"}
