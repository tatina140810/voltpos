from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.installment import Installment, InstallmentStatus
from app.models.installment_payment import InstallmentPayment, PaymentMethod
from app.models.user import User
from app.schemas.installment import InstallmentOut, InstallmentPaymentCreate

router = APIRouter(prefix="/installments", tags=["installments"])


@router.get("", response_model=list[InstallmentOut])
async def list_installments(
    status: str | None = Query(default=None),
    customer_id: int | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[Installment]:
    stmt = select(Installment).where(Installment.is_deleted.is_(False))
    if status:
        stmt = stmt.where(Installment.status == InstallmentStatus(status))
    if customer_id:
        stmt = stmt.where(Installment.customer_id == customer_id)
    return list((await db.execute(stmt.order_by(Installment.id.desc()))).scalars().all())


@router.get("/overdue", response_model=list[InstallmentOut])
async def overdue(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)) -> list[Installment]:
    stmt = select(Installment).where(
        Installment.is_deleted.is_(False),
        Installment.next_payment_date < datetime.now(timezone.utc).date(),
        Installment.status != InstallmentStatus.completed,
    )
    items = list((await db.execute(stmt)).scalars().all())
    for inst in items:
        inst.status = InstallmentStatus.overdue
    await db.commit()
    return items


@router.post("/{installment_id}/payment")
async def create_payment(
    installment_id: int,
    payload: InstallmentPaymentCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    installment = (
        await db.execute(select(Installment).where(Installment.id == installment_id, Installment.is_deleted.is_(False)))
    ).scalar_one_or_none()
    if not installment:
        raise HTTPException(status_code=404, detail="Рассрочка не найдена")
    payment = InstallmentPayment(
        installment_id=installment.id,
        amount=payload.amount,
        payment_method=PaymentMethod(payload.payment_method),
        paid_at=payload.paid_at,
        received_by=user.id,
    )
    installment.paid_amount += payload.amount
    if installment.paid_amount >= installment.total_amount:
        installment.status = InstallmentStatus.completed
    db.add(payment)
    await db.commit()
    return {"detail": "Платеж сохранен"}
