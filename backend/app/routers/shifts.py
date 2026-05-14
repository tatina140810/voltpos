from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.cash_withdrawal import CashWithdrawal
from app.models.sale import Sale, SaleStatus
from app.models.shift import Shift
from app.models.user import User

router = APIRouter(prefix="/shifts", tags=["shifts"])


def _zero() -> Decimal:
    return Decimal("0.00")


class ShiftOpen(BaseModel):
    opening_cash: Decimal = Decimal("0")
    notes: str | None = None


class ShiftClose(BaseModel):
    closing_cash_actual: Decimal = Decimal("0")
    notes: str | None = None


def _shift_dict(shift: Shift) -> dict:
    return {
        "id": shift.id,
        "cashier_id": shift.cashier_id,
        "opened_at": shift.opened_at.isoformat() if shift.opened_at else None,
        "closed_at": shift.closed_at.isoformat() if shift.closed_at else None,
        "opening_cash": str(shift.opening_cash or _zero()),
        "closing_cash_actual": str(shift.closing_cash_actual) if shift.closing_cash_actual is not None else None,
        "status": shift.status,
        "notes": shift.notes,
    }


async def _find_open_shift(db: AsyncSession, user: User) -> Shift | None:
    """Текущая открытая смена этого кассира (или None)."""
    return (
        await db.execute(
            select(Shift).where(
                Shift.org_id == user.org_id,
                Shift.cashier_id == user.id,
                Shift.status == "open",
            )
        )
    ).scalar_one_or_none()


@router.get("/current")
async def current_shift(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Текущая открытая смена пользователя. Возвращает {"shift": null} если её нет."""
    shift = await _find_open_shift(db, user)
    return {"shift": _shift_dict(shift) if shift else None}


@router.post("/open")
async def open_shift(
    payload: ShiftOpen,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Открывает новую смену. Если есть открытая — 409."""
    existing = await _find_open_shift(db, user)
    if existing:
        raise HTTPException(status_code=409, detail="У вас уже открыта смена")
    shift = Shift(
        org_id=user.org_id,
        cashier_id=user.id,
        opened_at=datetime.now(timezone.utc),
        opening_cash=payload.opening_cash or _zero(),
        notes=payload.notes,
        status="open",
    )
    db.add(shift)
    try:
        await db.commit()
    except IntegrityError:
        # Race: пока проверяли _find_open_shift, параллельный запрос уже открыл смену.
        # Партиал-уникальный индекс (uq_one_open_shift_per_cashier) защищает на уровне БД.
        await db.rollback()
        raise HTTPException(status_code=409, detail="У вас уже открыта смена")
    await db.refresh(shift)
    return _shift_dict(shift)


async def _compute_shift_totals(db: AsyncSession, shift: Shift) -> dict:
    """Считает суммы по продажам и инкассации, привязанным к смене."""
    sales = list(
        (
            await db.execute(
                select(Sale).where(
                    Sale.shift_id == shift.id,
                    Sale.is_deleted.is_(False),
                )
            )
        ).scalars().all()
    )
    cash_in = _zero()
    card_in = _zero()
    transfer_in = _zero()
    sales_count = 0
    returned_count = 0
    sales_total = _zero()  # сумма «продано» (без учёта возвратов)
    for s in sales:
        if s.status == SaleStatus.returned:
            returned_count += 1
            continue
        sales_count += 1
        sales_total += s.total or _zero()
        cash_in += s.paid_cash or _zero()
        card_in += s.paid_card or _zero()
        transfer_in += s.paid_transfer or _zero()

    inkas = (
        await db.execute(
            select(func.coalesce(func.sum(CashWithdrawal.amount), 0)).where(
                CashWithdrawal.shift_id == shift.id,
                CashWithdrawal.is_deleted.is_(False),
            )
        )
    ).scalar_one() or _zero()

    expected_cash = (shift.opening_cash or _zero()) + cash_in - Decimal(inkas)

    return {
        "sales_count": sales_count,
        "returned_count": returned_count,
        "sales_total": str(sales_total),
        "cash_in": str(cash_in),
        "card_in": str(card_in),
        "transfer_in": str(transfer_in),
        "inkas": str(Decimal(inkas)),
        "opening_cash": str(shift.opening_cash or _zero()),
        "expected_cash": str(expected_cash),
    }


@router.get("/{shift_id}/report")
async def shift_report(
    shift_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """X- или Z-отчёт смены. Если смена ещё открыта — это X (промежуточный),
    если закрыта — Z (с фактическим пересчётом наличных и расхождением)."""
    shift = (
        await db.execute(
            select(Shift).where(Shift.id == shift_id, Shift.org_id == user.org_id)
        )
    ).scalar_one_or_none()
    if not shift:
        raise HTTPException(status_code=404, detail="Смена не найдена")
    # Доступ к Z/X-отчёту имеет либо сам кассир смены, либо владелец магазина —
    # иначе любой продавец видел бы чужие финансы.
    if shift.cashier_id != user.id and user.role.value != "owner":
        raise HTTPException(status_code=403, detail="Нет доступа к чужой смене")

    totals = await _compute_shift_totals(db, shift)

    diff = None
    if shift.closing_cash_actual is not None:
        diff = str(Decimal(shift.closing_cash_actual) - Decimal(totals["expected_cash"]))

    return {
        "shift": _shift_dict(shift),
        "totals": totals,
        "report_kind": "Z" if shift.status == "closed" else "X",
        "discrepancy": diff,
    }


@router.post("/close")
async def close_shift(
    payload: ShiftClose,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Закрывает текущую открытую смену. Возвращает Z-отчёт."""
    shift = await _find_open_shift(db, user)
    if not shift:
        raise HTTPException(status_code=400, detail="У вас нет открытой смены")
    shift.status = "closed"
    shift.closed_at = datetime.now(timezone.utc)
    shift.closing_cash_actual = payload.closing_cash_actual or _zero()
    if payload.notes is not None:
        shift.notes = payload.notes
    await db.commit()
    await db.refresh(shift)

    totals = await _compute_shift_totals(db, shift)
    diff = str(Decimal(shift.closing_cash_actual) - Decimal(totals["expected_cash"]))
    return {
        "shift": _shift_dict(shift),
        "totals": totals,
        "report_kind": "Z",
        "discrepancy": diff,
    }
