from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models.cash_withdrawal import CashWithdrawal
from app.models.supplier import Supplier
from app.models.user import User
from app.schemas.cash_withdrawal import CashWithdrawalCreate, CashWithdrawalOut
from app.services.push_service import build_payload, send_push_to_org_owners

router = APIRouter(prefix="/cash-withdrawals", tags=["cash_withdrawals"])


@router.get("", response_model=list[CashWithdrawalOut])
async def list_withdrawals(
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[CashWithdrawalOut]:
    stmt = select(CashWithdrawal).where(
        CashWithdrawal.org_id == user.org_id,
        CashWithdrawal.is_deleted.is_(False),
    )
    filters = []
    if date_from:
        filters.append(func.date(CashWithdrawal.created_at) >= date_from)
    if date_to:
        filters.append(func.date(CashWithdrawal.created_at) <= date_to)
    if filters:
        stmt = stmt.where(and_(*filters))

    rows = list((await db.execute(stmt.order_by(CashWithdrawal.id.desc()))).scalars().all())

    user_ids = {r.issued_by_id for r in rows}
    users = (
        {
            u.id: u
            for u in (
                await db.execute(select(User).where(User.id.in_(user_ids)))
            ).scalars().all()
        }
        if user_ids
        else {}
    )
    supplier_ids = {r.supplier_id for r in rows if r.supplier_id}
    suppliers = (
        {
            s.id: s.name
            for s in (
                await db.execute(select(Supplier).where(Supplier.id.in_(supplier_ids)))
            ).scalars().all()
        }
        if supplier_ids
        else {}
    )

    return [
        CashWithdrawalOut(
            id=r.id,
            recipient=r.recipient,
            amount=r.amount,
            reason=r.reason,
            method=r.method or "cash",
            kind=r.kind or "expense",
            supplier_id=r.supplier_id,
            supplier_name=suppliers.get(r.supplier_id) if r.supplier_id else None,
            issued_by_id=r.issued_by_id,
            issued_by_name=users[r.issued_by_id].name if r.issued_by_id in users else None,
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.post("", response_model=CashWithdrawalOut)
async def create_withdrawal(
    payload: CashWithdrawalCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CashWithdrawalOut:
    if not payload.recipient.strip():
        raise HTTPException(status_code=400, detail="Укажите получателя")
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Сумма должна быть больше нуля")
    if payload.kind == "supplier" and not payload.supplier_id:
        raise HTTPException(status_code=400, detail="Для оплаты поставщику выберите поставщика из базы")
    # Если выбран поставщик — проверим что он наш.
    supplier_name: str | None = None
    if payload.supplier_id:
        sup = (
            await db.execute(
                select(Supplier).where(
                    Supplier.id == payload.supplier_id,
                    Supplier.org_id == user.org_id,
                    Supplier.is_deleted.is_(False),
                )
            )
        ).scalar_one_or_none()
        if not sup:
            raise HTTPException(status_code=404, detail="Поставщик не найден")
        supplier_name = sup.name

    # Привязываем к открытой смене кассира (для X/Z-отчётов).
    from app.models.shift import Shift
    open_shift = (
        await db.execute(
            select(Shift).where(
                Shift.org_id == user.org_id,
                Shift.cashier_id == user.id,
                Shift.status == "open",
            )
        )
    ).scalar_one_or_none()

    row = CashWithdrawal(
        org_id=user.org_id,
        issued_by_id=user.id,
        recipient=payload.recipient.strip(),
        amount=payload.amount,
        reason=(payload.reason or "").strip() or None,
        shift_id=open_shift.id if open_shift else None,
        method=payload.method or "cash",
        kind=payload.kind or "expense",
        supplier_id=payload.supplier_id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)

    background_tasks.add_task(
        send_push_to_org_owners,
        user.org_id,
        build_payload(
            "cashout",
            {
                "seller_name": user.name,
                "amount": float(row.amount),
                "reason": row.reason or row.recipient,
            },
        ),
    )
    return CashWithdrawalOut(
        id=row.id,
        recipient=row.recipient,
        amount=row.amount,
        reason=row.reason,
        method=row.method or "cash",
        kind=row.kind or "expense",
        supplier_id=row.supplier_id,
        supplier_name=supplier_name,
        issued_by_id=row.issued_by_id,
        issued_by_name=user.name,
        created_at=row.created_at,
    )


@router.delete("/{withdrawal_id}")
async def delete_withdrawal(
    withdrawal_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("owner")),
) -> dict:
    row = (
        await db.execute(
            select(CashWithdrawal).where(CashWithdrawal.id == withdrawal_id, CashWithdrawal.is_deleted.is_(False))
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    row.is_deleted = True
    row.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return {"detail": "Удалено"}


@router.get("/today/total")
async def today_total(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Сумма всех выдач за сегодня (по локальной дате сервера UTC)."""
    today = date.today()
    total = (
        await db.execute(
            select(func.coalesce(func.sum(CashWithdrawal.amount), 0)).where(
                CashWithdrawal.org_id == user.org_id,
                CashWithdrawal.is_deleted.is_(False),
                func.date(CashWithdrawal.created_at) == today,
            )
        )
    ).scalar_one()
    return {"date": today.isoformat(), "total": str(total or Decimal("0"))}
