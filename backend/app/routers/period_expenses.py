from datetime import date
from datetime import date as date_t
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_report_pin
from app.models.period_expense import PeriodExpense
from app.models.user import User

router = APIRouter(prefix="/period-expenses", tags=["period_expenses"])


class OtherExpenseRow(BaseModel):
    amount: str = ""
    comment: str = ""
    date: date_t | None = None  # для отображения «когда был расход» в режиме диапазона


class PeriodExpenseIn(BaseModel):
    salary: Decimal = Decimal("0")
    other_expenses: list[OtherExpenseRow] = []


class PeriodExpenseOut(BaseModel):
    period_from: date
    period_to: date
    salary: Decimal
    other_expenses: list[OtherExpenseRow]
    editable: bool  # true только когда from == to (один день)


@router.get("", response_model=PeriodExpenseOut)
async def get_period_expenses(
    from_: date = Query(alias="from"),
    to: date = Query(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_report_pin),
) -> PeriodExpenseOut:
    """Возвращает сохранённые расходы за период.
    - Если выбран один день (from == to) — отдаёт его запись (или нули) для редактирования.
    - Если выбран диапазон — суммирует salary всех дневных записей и склеивает их other_expenses
      в один плоский список (с пометкой даты).
    Доступ — только владелец (тот же PIN что и /reports/summary)."""
    rows = (
        await db.execute(
            select(PeriodExpense).where(
                PeriodExpense.org_id == user.org_id,
                PeriodExpense.period_from >= from_,
                PeriodExpense.period_to <= to,
            ).order_by(PeriodExpense.period_from)
        )
    ).scalars().all()

    editable = from_ == to

    total_salary = Decimal("0")
    all_other: list[OtherExpenseRow] = []
    for row in rows:
        total_salary += row.salary or Decimal("0")
        other: list[Any] = row.other_expenses or []
        for r in other:
            if isinstance(r, dict):
                all_other.append(OtherExpenseRow(
                    amount=str(r.get("amount") or ""),
                    comment=str(r.get("comment") or ""),
                    date=row.period_from,
                ))

    return PeriodExpenseOut(
        period_from=from_,
        period_to=to,
        salary=total_salary,
        other_expenses=all_other,
        editable=editable,
    )


@router.put("", response_model=PeriodExpenseOut)
async def upsert_period_expenses(
    payload: PeriodExpenseIn,
    from_: date = Query(alias="from"),
    to: date = Query(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_report_pin),
) -> PeriodExpenseOut:
    """Сохраняет расходы только за один день (from == to). Иначе 400."""
    if from_ != to:
        raise HTTPException(
            status_code=400,
            detail="Сохранять расходы можно только за один день. Выберите конкретную дату.",
        )

    row = (
        await db.execute(
            select(PeriodExpense).where(
                PeriodExpense.org_id == user.org_id,
                PeriodExpense.period_from == from_,
                PeriodExpense.period_to == to,
            )
        )
    ).scalar_one_or_none()

    other_json = [
        {"amount": r.amount or "", "comment": r.comment or ""} for r in payload.other_expenses
    ]

    if row is None:
        row = PeriodExpense(
            org_id=user.org_id,
            period_from=from_,
            period_to=to,
            salary=payload.salary or Decimal("0"),
            other_expenses=other_json,
        )
        db.add(row)
    else:
        row.salary = payload.salary or Decimal("0")
        row.other_expenses = other_json

    await db.commit()
    await db.refresh(row)

    return PeriodExpenseOut(
        period_from=row.period_from,
        period_to=row.period_to,
        salary=row.salary or Decimal("0"),
        other_expenses=[
            OtherExpenseRow(amount=r.get("amount", ""), comment=r.get("comment", ""), date=row.period_from)
            for r in (row.other_expenses or [])
        ],
        editable=True,
    )
