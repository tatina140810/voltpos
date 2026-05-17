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

    # Для Sale-фулфилментов заказов: paid_* включает зачтённые предоплаты, которые
    # физически пришли в кассу в другую смену. Чтобы не задваивать выручку этой смены,
    # вычитаем из paid_* суммы OrderPayment с shift_id != текущая смена.
    from app.models.order import Order, OrderPayment
    sale_ids = [s.id for s in sales]
    foreign_prep_by_sale: dict[int, dict[str, "Decimal"]] = {}
    if sale_ids:
        rows = (
            await db.execute(
                select(OrderPayment, Order.sale_id)
                .join(Order, Order.id == OrderPayment.order_id)
                .where(Order.sale_id.in_(sale_ids))
            )
        ).all()
        for op_row, sale_id in rows:
            # Учитываем только зачёты «не из этой смены» (другая смена или NULL).
            if op_row.shift_id == shift.id:
                continue
            sign = Decimal(1) if op_row.kind == "deposit" else Decimal(-1)
            agg = foreign_prep_by_sale.setdefault(
                sale_id, {"cash": _zero(), "card": _zero(), "transfer": _zero()}
            )
            if op_row.method in agg:
                agg[op_row.method] += (op_row.amount or _zero()) * sign

    for s in sales:
        if s.status == SaleStatus.returned:
            returned_count += 1
            continue
        sales_count += 1
        sales_total += s.total or _zero()
        foreign = foreign_prep_by_sale.get(s.id, {"cash": _zero(), "card": _zero(), "transfer": _zero()})
        # paid_cash минус та часть, что пришла предоплатой в другую смену.
        cash_in += (s.paid_cash or _zero()) - foreign["cash"]
        card_in += (s.paid_card or _zero()) - foreign["card"]
        transfer_in += (s.paid_transfer or _zero()) - foreign["transfer"]

    # Инкассации/выдачи смены, разбитые по методу. Нужно чтобы посчитать
    # «должно быть» отдельно для нал/карта/перевод.
    inkas_rows = (
        await db.execute(
            select(CashWithdrawal).where(
                CashWithdrawal.shift_id == shift.id,
                CashWithdrawal.is_deleted.is_(False),
            )
        )
    ).scalars().all()
    inkas_cash = sum(((r.amount or _zero()) for r in inkas_rows if (r.method or "cash") == "cash"), start=_zero())
    inkas_card = sum(((r.amount or _zero()) for r in inkas_rows if r.method == "card"), start=_zero())
    inkas_transfer = sum(((r.amount or _zero()) for r in inkas_rows if r.method == "transfer"), start=_zero())
    inkas = inkas_cash + inkas_card + inkas_transfer

    # Возвраты клиентам в эту смену (журнал Refund). Отдельная строка в Z-отчёте,
    # чтобы кассир видел оборот, а не только нетто-выручку.
    from app.models.refund import Refund
    refunds_rows = (
        await db.execute(
            select(
                func.coalesce(func.sum(Refund.cash), 0),
                func.coalesce(func.sum(Refund.card), 0),
                func.coalesce(func.sum(Refund.transfer), 0),
            ).where(Refund.shift_id == shift.id)
        )
    ).one()
    cash_refunded = Decimal(refunds_rows[0] or 0)
    card_refunded = Decimal(refunds_rows[1] or 0)
    transfer_refunded = Decimal(refunds_rows[2] or 0)

    # В cash_in исходного цикла уже учтены paid_cash ПОСЛЕ уменьшения возвратом
    # (см. return_sale_items). Значит cash_in уже «с учётом» — но кассир хочет
    # видеть и оборот: сколько пришло (gross) минус сколько вернули.
    # Для прозрачности возвращаем gross = cash_in + cash_refunded.
    cash_in_gross = cash_in + cash_refunded
    card_in_gross = card_in + card_refunded
    transfer_in_gross = transfer_in + transfer_refunded

    # Предоплаты по заказам в эту смену (deposit − refund). Физически меняют кассу,
    # но это не выручка — отдельной строкой в Z-отчёте.
    from app.models.order import OrderPayment as _OP
    op_rows = (
        await db.execute(
            select(_OP).where(_OP.shift_id == shift.id)
        )
    ).scalars().all()
    prep_cash = _zero()
    prep_card = _zero()
    prep_transfer = _zero()
    for op_row in op_rows:
        sign = Decimal(1) if op_row.kind == "deposit" else Decimal(-1)
        amt = (op_row.amount or _zero()) * sign
        if op_row.method == "cash":
            prep_cash += amt
        elif op_row.method == "card":
            prep_card += amt
        elif op_row.method == "transfer":
            prep_transfer += amt

    # «Должно быть» по каждому методу = пришло − инкассировано/выдано + предоплаты по методу.
    # Для cash добавляем opening_cash (стартовый остаток в кассе).
    expected_cash = (shift.opening_cash or _zero()) + cash_in - inkas_cash + prep_cash
    expected_card = card_in - inkas_card + prep_card
    expected_transfer = transfer_in - inkas_transfer + prep_transfer

    return {
        "sales_count": sales_count,
        "returned_count": returned_count,
        "sales_total": str(sales_total),
        "cash_in": str(cash_in),  # нетто, после возвратов
        "card_in": str(card_in),
        "transfer_in": str(transfer_in),
        "cash_in_gross": str(cash_in_gross),  # сколько пришло до возвратов
        "card_in_gross": str(card_in_gross),
        "transfer_in_gross": str(transfer_in_gross),
        "cash_refunded": str(cash_refunded),
        "card_refunded": str(card_refunded),
        "transfer_refunded": str(transfer_refunded),
        "inkas": str(inkas),
        "inkas_cash": str(inkas_cash),
        "inkas_card": str(inkas_card),
        "inkas_transfer": str(inkas_transfer),
        "prepayments_cash": str(prep_cash),
        "prepayments_card": str(prep_card),
        "prepayments_transfer": str(prep_transfer),
        "opening_cash": str(shift.opening_cash or _zero()),
        "expected_cash": str(expected_cash),
        "expected_card": str(expected_card),
        "expected_transfer": str(expected_transfer),
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

    # Для закрытой смены берём снимок (если есть) — иначе возвраты в новой смене
    # ретроактивно меняли бы Z-отчёт старой.
    if shift.status == "closed" and shift.totals_snapshot:
        totals = shift.totals_snapshot
    else:
        totals = await _compute_shift_totals(db, shift)
        # Lazy backfill: для смен, закрытых ДО релиза snapshot — фиксируем
        # текущие итоги, чтобы повторные запросы не «дрейфовали» от поздних возвратов.
        if shift.status == "closed" and not shift.totals_snapshot:
            shift.totals_snapshot = totals
            await db.commit()

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
    # Сначала считаем итоги (по «живому» состоянию), потом помечаем закрытой и сохраняем snapshot.
    totals = await _compute_shift_totals(db, shift)

    shift.status = "closed"
    shift.closed_at = datetime.now(timezone.utc)
    shift.closing_cash_actual = payload.closing_cash_actual or _zero()
    shift.totals_snapshot = totals  # «замораживаем» Z-отчёт
    if payload.notes is not None:
        shift.notes = payload.notes
    await db.commit()
    await db.refresh(shift)

    diff = str(Decimal(shift.closing_cash_actual) - Decimal(totals["expected_cash"]))
    return {
        "shift": _shift_dict(shift),
        "totals": totals,
        "report_kind": "Z",
        "discrepancy": diff,
    }
