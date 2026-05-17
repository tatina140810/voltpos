from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_report_pin
from app.models.cash_withdrawal import CashWithdrawal
from app.models.customer import Customer
from app.models.debt_payment import DebtPayment
from app.models.order import Order
from app.models.product import Product
from app.models.sale import DeliveryType, Sale, SaleStatus
from app.models.sale_item import SaleItem
from app.models.stock import StockMovement, StockMovementType
from app.models.user import User

router = APIRouter(prefix="/reports", tags=["reports"])


def _zero() -> Decimal:
    return Decimal("0.00")


def _paid_total(s: Sale) -> Decimal:
    return (s.paid_cash or _zero()) + (s.paid_card or _zero()) + (s.paid_transfer or _zero())


@router.get("/summary")
async def summary_report(
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None, alias="to"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_report_pin),
) -> dict:
    """Сводный отчёт за период: продажи, реальная выручка по способам оплаты,
    возвраты, новый долг за период, текущая общая задолженность, инкассация,
    чистая наличка (касса минус инкассация), разбивка по продавцам и по дням."""

    # === 1. Все продажи в периоде ===
    sales_stmt = (
        select(Sale, User.name.label("seller_name"))
        .join(User, Sale.seller_id == User.id)
        .where(Sale.org_id == user.org_id, Sale.is_deleted.is_(False))
    )
    if from_:
        sales_stmt = sales_stmt.where(func.date(Sale.created_at) >= from_)
    if to:
        sales_stmt = sales_stmt.where(func.date(Sale.created_at) <= to)
    sales_rows = (await db.execute(sales_stmt.order_by(Sale.created_at.desc()))).all()

    sales = [r.Sale for r in sales_rows]
    seller_names = {r.Sale.id: r.seller_name for r in sales_rows}

    # === 2. Items для агрегации товарных строк (count, names) ===
    sale_ids = [s.id for s in sales]
    items_count_by_sale: dict[int, int] = {}
    items_names_by_sale: dict[int, str] = {}
    if sale_ids:
        cnt_rows = (
            await db.execute(
                select(SaleItem.sale_id, func.count(SaleItem.id))
                .where(SaleItem.sale_id.in_(sale_ids), SaleItem.is_deleted.is_(False))
                .group_by(SaleItem.sale_id)
            )
        ).all()
        items_count_by_sale = {sid: int(cnt) for sid, cnt in cnt_rows}
        names_rows = (
            await db.execute(
                select(SaleItem.sale_id, func.string_agg(Product.name, ", "))
                .join(Product, Product.id == SaleItem.product_id)
                .where(SaleItem.sale_id.in_(sale_ids), SaleItem.is_deleted.is_(False))
                .group_by(SaleItem.sale_id)
            )
        ).all()
        items_names_by_sale = {sid: names for sid, names in names_rows}

    # === 3. Customers для отображения имён в строке продажи ===
    customer_ids = {s.customer_id for s in sales if s.customer_id}
    customers = (
        {
            c.id: c.name
            for c in (
                await db.execute(select(Customer).where(Customer.id.in_(customer_ids)))
            ).scalars().all()
        }
        if customer_ids
        else {}
    )

    # === 4. Агрегаты: реальная выручка, статусы, по продавцам, по дням ===
    revenue_cash = _zero()
    revenue_card = _zero()
    revenue_transfer = _zero()
    new_debt_amount = _zero()  # неоплаченный остаток по новым долговым продажам в периоде
    returned_amount = _zero()
    completed_count = 0
    debt_count = 0
    returned_count = 0
    by_seller: dict[int, dict] = {}
    by_day: dict[str, dict] = {}

    # Собираем все погашения долга по продажам ИЗ ВЫБОРКИ — чтобы вычесть их
    # из Sale.paid_*, иначе погашение из будущих периодов исказит выручку
    # текущего (Sale.paid_cash в БД уже включает все когда-либо сделанные DebtPayment).
    sale_debt_payments_cash: dict[int, Decimal] = {}
    sale_debt_payments_card: dict[int, Decimal] = {}
    sale_debt_payments_transfer: dict[int, Decimal] = {}
    if sale_ids:
        for dp in (
            await db.execute(
                select(DebtPayment).where(
                    DebtPayment.sale_id.in_(sale_ids),
                )
            )
        ).scalars().all():
            target = (
                sale_debt_payments_cash if dp.method == "cash"
                else sale_debt_payments_card if dp.method == "card"
                else sale_debt_payments_transfer
            )
            target[dp.sale_id] = target.get(dp.sale_id, _zero()) + (dp.amount or _zero())

    # Для Sale-фулфилментов заказов: paid_* включает зачтённые предоплаты, которые
    # физически пришли в кассу в другой период. Чтобы не задваивать выручку периода,
    # вычитаем из paid_* суммы OrderPayment с created_at ВНЕ запрошенного периода.
    from app.models.order import Order, OrderPayment
    sale_foreign_prep_cash: dict[int, Decimal] = {}
    sale_foreign_prep_card: dict[int, Decimal] = {}
    sale_foreign_prep_transfer: dict[int, Decimal] = {}
    if sale_ids:
        prep_rows = (
            await db.execute(
                select(OrderPayment, Order.sale_id)
                .join(Order, Order.id == OrderPayment.order_id)
                .where(Order.sale_id.in_(sale_ids))
            )
        ).all()
        for op_row, sale_id in prep_rows:
            # Зачёт «не из этого периода» — если создан раньше from_ или позже to.
            op_date = op_row.created_at.date() if op_row.created_at else None
            in_period = True
            if op_date is not None:
                if from_ and op_date < from_:
                    in_period = False
                if to and op_date > to:
                    in_period = False
            if in_period:
                continue  # эта предоплата уже в prep_in/refund текущего периода
            sign = Decimal(1) if op_row.kind == "deposit" else Decimal(-1)
            amt = (op_row.amount or _zero()) * sign
            if op_row.method == "cash":
                sale_foreign_prep_cash[sale_id] = sale_foreign_prep_cash.get(sale_id, _zero()) + amt
            elif op_row.method == "card":
                sale_foreign_prep_card[sale_id] = sale_foreign_prep_card.get(sale_id, _zero()) + amt
            elif op_row.method == "transfer":
                sale_foreign_prep_transfer[sale_id] = sale_foreign_prep_transfer.get(sale_id, _zero()) + amt

    for s in sales:
        # «Нативная» оплата = всё что в paid_*, минус все погашения долга по этой продаже
        # (они учтены отдельно ниже, чтобы попасть в выручку именно того периода, когда заплатили).
        # И минус зачтённые предоплаты из других периодов (иначе двойной счёт с prepayments_received).
        native_cash = (s.paid_cash or _zero()) - sale_debt_payments_cash.get(s.id, _zero()) - sale_foreign_prep_cash.get(s.id, _zero())
        native_card = (s.paid_card or _zero()) - sale_debt_payments_card.get(s.id, _zero()) - sale_foreign_prep_card.get(s.id, _zero())
        native_transfer = (s.paid_transfer or _zero()) - sale_debt_payments_transfer.get(s.id, _zero()) - sale_foreign_prep_transfer.get(s.id, _zero())
        revenue_cash += max(_zero(), native_cash)
        revenue_card += max(_zero(), native_card)
        revenue_transfer += max(_zero(), native_transfer)

        if s.status == SaleStatus.completed:
            completed_count += 1
        elif s.status == SaleStatus.debt:
            debt_count += 1
            outstanding = max(_zero(), s.total - _paid_total(s))
            new_debt_amount += outstanding
        elif s.status == SaleStatus.returned:
            returned_count += 1
            returned_amount += s.total

        seller_id = s.seller_id
        bs = by_seller.setdefault(
            seller_id,
            {"seller_id": seller_id, "seller_name": seller_names.get(s.id, ""), "sales_count": 0, "revenue": _zero()},
        )
        bs["sales_count"] += 1
        bs["revenue"] += _paid_total(s)

        if s.created_at:
            day = s.created_at.date().isoformat()
            bd = by_day.setdefault(day, {"date": day, "revenue": _zero(), "sales_count": 0})
            bd["revenue"] += _paid_total(s)
            bd["sales_count"] += 1

    # Все погашения долга в периоде (по любым продажам, в т.ч. старым) — их выручка
    # должна учитываться в дне фактического получения денег, а не в дне создания продажи.
    dp_stmt = select(DebtPayment).where(
        DebtPayment.org_id == user.org_id,
    )
    if from_:
        dp_stmt = dp_stmt.where(func.date(DebtPayment.created_at) >= from_)
    if to:
        dp_stmt = dp_stmt.where(func.date(DebtPayment.created_at) < (to + timedelta(days=1)))
    period_dps = list((await db.execute(dp_stmt)).scalars().all())
    # Сохраняем «нативную» выручку (только от продаж в периоде) ДО добавления погашений —
    # бухгалтеру нужно отличать «продал» от «получил старый долг».
    sales_cash = revenue_cash
    sales_card = revenue_card
    sales_transfer = revenue_transfer
    debt_payments_cash = _zero()
    debt_payments_card = _zero()
    debt_payments_transfer = _zero()
    for dp in period_dps:
        amount = dp.amount or _zero()
        if dp.method == "cash":
            debt_payments_cash += amount
            revenue_cash += amount
        elif dp.method == "card":
            debt_payments_card += amount
            revenue_card += amount
        else:
            debt_payments_transfer += amount
            revenue_transfer += amount

    revenue_total = revenue_cash + revenue_card + revenue_transfer
    sales_total_amount = sum((s.total for s in sales), start=_zero())

    # === 4b. Себестоимость и общая скидка (для бухгалтерского отчёта) ===
    cost_total = _zero()
    subtotal_total = _zero()
    # Возвращённые продажи в себестоимость не идут — иначе расход завышен.
    non_returned_ids = [s.id for s in sales if s.status != SaleStatus.returned]
    if non_returned_ids:
        items_rows = list(
            (
                await db.execute(
                    select(
                        SaleItem.product_id,
                        SaleItem.quantity,
                        SaleItem.price,
                        SaleItem.weight_grams,
                    )
                    .where(SaleItem.sale_id.in_(non_returned_ids), SaleItem.is_deleted.is_(False))
                )
            ).all()
        )
        product_ids = {pid for pid, _q, _p, _w in items_rows}
        purchase_prices: dict[int, Decimal] = {}
        if product_ids:
            for p in (
                await db.execute(select(Product).where(Product.id.in_(product_ids)))
            ).scalars().all():
                purchase_prices[p.id] = p.purchase_price or _zero()
        for pid, qty, price, weight_grams in items_rows:
            # Для весовых эффективное «количество» — это вес в кг (weight_grams/1000),
            # quantity в чеке у весовых = 1, а сумма считается по price * вес.
            if weight_grams and weight_grams > 0:
                eff_qty = Decimal(weight_grams) / Decimal(1000)
            else:
                eff_qty = Decimal(qty)
            subtotal_total += (price or _zero()) * eff_qty
            cost_total += purchase_prices.get(pid, _zero()) * eff_qty
    # sales_total_amount = sum(Sale.total), а Sale.total включает delivery_price + installation_price.
    # Чтобы скидка была честной (только по товарам), вычитаем эти доплаты из продажи.
    extras_total = sum(((s.delivery_price or _zero()) + (s.installation_price or _zero()) for s in sales), start=_zero())
    discount_total = max(_zero(), subtotal_total - (sales_total_amount - extras_total))

    # === 5. Инкассация в периоде ===
    cw_stmt = select(CashWithdrawal).where(
        CashWithdrawal.org_id == user.org_id, CashWithdrawal.is_deleted.is_(False)
    )
    if from_:
        cw_stmt = cw_stmt.where(func.date(CashWithdrawal.created_at) >= from_)
    if to:
        cw_stmt = cw_stmt.where(func.date(CashWithdrawal.created_at) <= to)
    cw_rows = list((await db.execute(cw_stmt.order_by(CashWithdrawal.created_at.desc()))).scalars().all())

    cw_user_ids = {r.issued_by_id for r in cw_rows}
    cw_users = (
        {
            u.id: u.name
            for u in (
                await db.execute(select(User).where(User.id.in_(cw_user_ids)))
            ).scalars().all()
        }
        if cw_user_ids
        else {}
    )
    cw_total = sum((r.amount for r in cw_rows), start=_zero())
    # Разбивка инкассации/выдач по методу (нал/карта/перевод) — чтобы корректно
    # считать «должно остаться» для каждой кассы.
    cw_cash = sum((r.amount for r in cw_rows if (r.method or "cash") == "cash"), start=_zero())
    cw_card = sum((r.amount for r in cw_rows if r.method == "card"), start=_zero())
    cw_transfer = sum((r.amount for r in cw_rows if r.method == "transfer"), start=_zero())

    # Оплаты поставщикам — это движение денег, не расход бизнеса (товар уже актив
    # или ещё не пришёл). Показываем отдельно и НЕ вычитаем из прибыли.
    supplier_payments_total = _zero()
    supplier_payments_by_id: dict[int, dict] = {}
    for r in cw_rows:
        if r.kind == "supplier" and r.supplier_id:
            supplier_payments_total += r.amount or _zero()
            agg = supplier_payments_by_id.setdefault(
                r.supplier_id,
                {"supplier_id": r.supplier_id, "supplier_name": None, "total": _zero(), "cash": _zero(), "card": _zero(), "transfer": _zero(), "count": 0},
            )
            agg["total"] += r.amount or _zero()
            agg["count"] += 1
            method = r.method or "cash"
            if method in ("cash", "card", "transfer"):
                agg[method] += r.amount or _zero()
    # Заполним имена поставщиков.
    if supplier_payments_by_id:
        from app.models.supplier import Supplier as _Supplier
        sup_names = {
            s.id: s.name
            for s in (
                await db.execute(select(_Supplier).where(_Supplier.id.in_(supplier_payments_by_id.keys())))
            ).scalars().all()
        }
        for sid, agg in supplier_payments_by_id.items():
            agg["supplier_name"] = sup_names.get(sid)

    # === 5b. Предоплаты по заказам за период ===
    # Не выручка — это полученные авансы. Касса физически увеличивается, но profit нет.
    from app.models.order import OrderPayment as _OP
    op_stmt = (
        select(_OP)
        .join(Order, Order.id == _OP.order_id)
        .where(Order.org_id == user.org_id)
    )
    if from_:
        op_stmt = op_stmt.where(func.date(_OP.created_at) >= from_)
    if to:
        op_stmt = op_stmt.where(func.date(_OP.created_at) < (to + timedelta(days=1)))
    op_rows = list((await db.execute(op_stmt)).scalars().all())
    prep_in = {"cash": _zero(), "card": _zero(), "transfer": _zero()}
    prep_refund = {"cash": _zero(), "card": _zero(), "transfer": _zero()}
    for op_row in op_rows:
        target = prep_in if op_row.kind == "deposit" else prep_refund
        if op_row.method in target:
            target[op_row.method] += op_row.amount or _zero()
    prep_in_total = sum(prep_in.values(), start=_zero())
    prep_refund_total = sum(prep_refund.values(), start=_zero())
    prep_net = {m: prep_in[m] - prep_refund[m] for m in ("cash", "card", "transfer")}

    # === 6. Текущая общая задолженность (на момент запроса, по всей организации) ===
    # NB: при создании DebtPayment в routers/customers.py paid_cash/card/transfer
    # уже увеличиваются, поэтому _paid_total(s) ВКЛЮЧАЕТ погашения. Не вычитать дважды.
    all_debt_sales = list(
        (
            await db.execute(
                select(Sale).where(
                    Sale.org_id == user.org_id,
                    Sale.is_deleted.is_(False),
                    Sale.status == SaleStatus.debt,
                )
            )
        ).scalars().all()
    )
    outstanding_total = _zero()
    for s in all_debt_sales:
        outstanding_total += max(_zero(), s.total - _paid_total(s))

    # === 7. Чистый остаток по методам = выручка − выдачи того же метода ===
    net_cash = revenue_cash - cw_cash
    net_card = revenue_card - cw_card
    net_transfer = revenue_transfer - cw_transfer

    # === 7b. Доставки и установки за период ===
    deliveries: list[dict] = []
    installations: list[dict] = []
    deliveries_total = _zero()
    installations_total = _zero()
    for s in sales:
        is_delivery = s.delivery_type != DeliveryType.none
        is_install = bool(s.installation)
        if not (is_delivery or is_install):
            continue
        cust_name = customers.get(s.customer_id) if s.customer_id else None
        if is_delivery:
            price = s.delivery_price or _zero()
            deliveries_total += price
            deliveries.append(
                {
                    "sale_id": s.id,
                    "created_at": s.created_at.isoformat() if s.created_at else None,
                    "customer_name": cust_name,
                    "address": s.delivery_address,
                    "delivery_date": s.delivery_date.isoformat() if s.delivery_date else None,
                    "type": s.delivery_type.value,
                    "price": str(price),
                }
            )
        if is_install:
            price = s.installation_price or _zero()
            installations_total += price
            installations.append(
                {
                    "sale_id": s.id,
                    "created_at": s.created_at.isoformat() if s.created_at else None,
                    "customer_name": cust_name,
                    "price": str(price),
                }
            )

    # === 8. Список продаж для таблицы (последние 200, сортировка от свежих) ===
    sales_list = [
        {
            "id": s.id,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "seller_name": seller_names.get(s.id, ""),
            "customer_name": customers.get(s.customer_id) if s.customer_id else None,
            "items_count": items_count_by_sale.get(s.id, 0),
            "items_names": items_names_by_sale.get(s.id, ""),
            "total": str(s.total),
            "paid_cash": str(s.paid_cash or _zero()),
            "paid_card": str(s.paid_card or _zero()),
            "paid_transfer": str(s.paid_transfer or _zero()),
            "status": s.status.value,
        }
        for s in sales[:200]
    ]

    # === 8b. Зарплата и прочие расходы из PeriodExpense за период (для расчёта прибыли) ===
    from app.models.period_expense import PeriodExpense
    pe_stmt = select(PeriodExpense).where(PeriodExpense.org_id == user.org_id)
    # Пересечение интервалов: запись попадает если её период пересекает запрошенный
    # (period_from ≤ to AND period_to ≥ from_). Иначе расход «месяц» не попал бы в «неделю».
    if to:
        pe_stmt = pe_stmt.where(PeriodExpense.period_from <= to)
    if from_:
        pe_stmt = pe_stmt.where(PeriodExpense.period_to >= from_)
    period_expenses_rows = list((await db.execute(pe_stmt)).scalars().all())
    salary_total = _zero()
    other_expenses_total = _zero()
    for row in period_expenses_rows:
        salary_total += row.salary or _zero()
        for r in (row.other_expenses or []):
            if isinstance(r, dict):
                try:
                    other_expenses_total += Decimal(str(r.get("amount") or 0))
                except Exception:
                    pass

    # === 8c. Ревизии: излишки и недостачи за период (по закупочной цене) ===
    # Движения от ревизии создаются с reason LIKE 'Ревизия #...' и не попадают
    # ни в /reports/writeoffs, ни в cost_total (там только sale_items).
    # Включаем их в сводный отчёт как отдельную статью, чтобы 180 сом недостачи
    # после ревизии были видны бухгалтеру.
    rev_stmt = (
        select(StockMovement, Product.purchase_price)
        .join(Product, Product.id == StockMovement.product_id)
        .where(
            StockMovement.org_id == user.org_id,
            StockMovement.is_deleted.is_(False),
            StockMovement.reason.ilike("Ревизия%"),
        )
    )
    if from_:
        rev_stmt = rev_stmt.where(func.date(StockMovement.created_at) >= from_)
    if to:
        rev_stmt = rev_stmt.where(func.date(StockMovement.created_at) <= to)
    rev_rows = (await db.execute(rev_stmt)).all()
    rev_surplus_value = _zero()   # излишки (in_stock от ревизии) — +
    rev_shortage_value = _zero()  # недостачи (out от ревизии) — −
    for m, purchase_price in rev_rows:
        eff_qty = Decimal(m.quantity_decimal) if m.quantity_decimal is not None else Decimal(m.quantity)
        value = eff_qty * (purchase_price or _zero())
        if m.type == StockMovementType.in_stock:
            rev_surplus_value += value
        else:
            rev_shortage_value += value  # храним положительной, знак в UI
    rev_net = rev_surplus_value - rev_shortage_value  # >0 излишек итого, <0 недостача

    # Прибыль = выручка − себестоимость − зарплата − прочие расходы.
    # Скидка уже в revenue_total (продажа уже с учётом). Инкассация — это движение
    # денег, не расход бизнеса, в прибыли не учитывается.
    # Ревизионная недостача — это потеря, излишек — «бесплатный товар». Учитываем в прибыли.
    profit = revenue_total - cost_total - salary_total - other_expenses_total + rev_net

    # === 9. Финальная сборка ответа ===
    return {
        "period": {"from": from_.isoformat() if from_ else None, "to": to.isoformat() if to else None},
        "revenue": {
            "cash": str(revenue_cash),
            "card": str(revenue_card),
            "transfer": str(revenue_transfer),
            "total": str(revenue_total),
            # Разделение: бухгалтер должен отличать «продажа» от «получили старый долг».
            "sales_only": {
                "cash": str(sales_cash),
                "card": str(sales_card),
                "transfer": str(sales_transfer),
                "total": str(sales_cash + sales_card + sales_transfer),
            },
            "debt_payments": {
                "cash": str(debt_payments_cash),
                "card": str(debt_payments_card),
                "transfer": str(debt_payments_transfer),
                "total": str(debt_payments_cash + debt_payments_card + debt_payments_transfer),
            },
        },
        "sales": {
            "count": len(sales),
            "total_amount": str(sales_total_amount),
            "subtotal": str(subtotal_total),
            "discount_total": str(discount_total),
            "cost_total": str(cost_total),
            "completed_count": completed_count,
            "debt_count": debt_count,
            "returned_count": returned_count,
        },
        "returns": {"count": returned_count, "amount": str(returned_amount)},
        "debt": {
            "new_debt_amount": str(new_debt_amount),
            "outstanding_total": str(outstanding_total),
        },
        "cash_withdrawals": {
            "count": len(cw_rows),
            "total": str(cw_total),
            "by_method": {
                "cash": str(cw_cash),
                "card": str(cw_card),
                "transfer": str(cw_transfer),
            },
            "items": [
                {
                    "id": r.id,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                    "recipient": r.recipient,
                    "amount": str(r.amount),
                    "reason": r.reason,
                    "method": r.method or "cash",
                    "kind": r.kind or "expense",
                    "supplier_id": r.supplier_id,
                    "issued_by_name": cw_users.get(r.issued_by_id),
                }
                for r in cw_rows
            ],
        },
        "supplier_payments": {
            "count": sum(int(s["count"]) for s in supplier_payments_by_id.values()),
            "total": str(supplier_payments_total),
            "by_supplier": [
                {
                    "supplier_id": s["supplier_id"],
                    "supplier_name": s["supplier_name"],
                    "total": str(s["total"]),
                    "cash": str(s["cash"]),
                    "card": str(s["card"]),
                    "transfer": str(s["transfer"]),
                    "count": s["count"],
                }
                for s in supplier_payments_by_id.values()
            ],
        },
        "net_cash": str(net_cash),
        "net_card": str(net_card),
        "net_transfer": str(net_transfer),
        "prepayments_received": {
            "cash": str(prep_in["cash"]),
            "card": str(prep_in["card"]),
            "transfer": str(prep_in["transfer"]),
            "total": str(prep_in_total),
        },
        "prepayments_refunded": {
            "cash": str(prep_refund["cash"]),
            "card": str(prep_refund["card"]),
            "transfer": str(prep_refund["transfer"]),
            "total": str(prep_refund_total),
        },
        "prepayments_net": {
            "cash": str(prep_net["cash"]),
            "card": str(prep_net["card"]),
            "transfer": str(prep_net["transfer"]),
        },
        "profit": {
            "revenue": str(revenue_total),
            "cost": str(cost_total),
            "salary": str(salary_total),
            "other_expenses": str(other_expenses_total),
            "revision_surplus": str(rev_surplus_value),
            "revision_shortage": str(rev_shortage_value),
            "revision_net": str(rev_net),
            "total": str(profit),
        },
        "revisions_period": {
            "surplus_value": str(rev_surplus_value),
            "shortage_value": str(rev_shortage_value),
            "net_value": str(rev_net),
            "movements_count": len(rev_rows),
        },
        "by_seller": [
            {
                "seller_id": v["seller_id"],
                "seller_name": v["seller_name"],
                "sales_count": v["sales_count"],
                "revenue": str(v["revenue"]),
            }
            for v in sorted(by_seller.values(), key=lambda x: x["revenue"], reverse=True)
        ],
        "by_day": [
            {"date": v["date"], "revenue": float(v["revenue"]), "sales_count": v["sales_count"]}
            for v in sorted(by_day.values(), key=lambda x: x["date"])
        ],
        "sales_list": sales_list,
        "deliveries": {
            "count": len(deliveries),
            "total": str(deliveries_total),
            "items": deliveries,
        },
        "installations": {
            "count": len(installations),
            "total": str(installations_total),
            "items": installations,
        },
    }


@router.get("/sales")
async def sales_report(
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None, alias="to"),
    seller_id: int | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_report_pin),
) -> dict:
    sale_items_count_subq = (
        select(SaleItem.sale_id, func.count(SaleItem.id).label("items_count"))
        .where(SaleItem.is_deleted.is_(False))
        .group_by(SaleItem.sale_id)
        .subquery()
    )

    base_stmt = (
        select(Sale, User.name.label("seller_name"), func.coalesce(sale_items_count_subq.c.items_count, 0).label("items_count"))
        .join(User, Sale.seller_id == User.id)
        .outerjoin(sale_items_count_subq, sale_items_count_subq.c.sale_id == Sale.id)
        .where(Sale.is_deleted.is_(False))
    )

    if from_:
        base_stmt = base_stmt.where(func.date(Sale.created_at) >= from_)
    if to:
        base_stmt = base_stmt.where(func.date(Sale.created_at) <= to)
    if seller_id:
        base_stmt = base_stmt.where(Sale.seller_id == seller_id)

    rows = (await db.execute(base_stmt.order_by(Sale.created_at.desc()))).all()

    sale_ids = [row.Sale.id for row in rows]
    items_names_by_sale: dict[int, str] = {}
    if sale_ids:
        names_rows = (
            await db.execute(
                select(
                    SaleItem.sale_id,
                    func.string_agg(Product.name, ", ").label("items_names"),
                )
                .join(Product, Product.id == SaleItem.product_id)
                .where(SaleItem.sale_id.in_(sale_ids), SaleItem.is_deleted.is_(False))
                .group_by(SaleItem.sale_id)
            )
        ).all()
        items_names_by_sale = {row.sale_id: row.items_names for row in names_rows}

    sales = [
        {
            "id": row.Sale.id,
            "created_at": row.Sale.created_at.isoformat() if row.Sale.created_at else None,
            "seller_name": row.seller_name,
            "items_count": int(row.items_count),
            "items_names": items_names_by_sale.get(row.Sale.id, ""),
            "total": str(row.Sale.total),
            "paid_cash": str(row.Sale.paid_cash),
            "paid_card": str(row.Sale.paid_card),
            "paid_transfer": str(row.Sale.paid_transfer),
            "status": row.Sale.status.value,
        }
        for row in rows
    ]

    total_sales_amount = sum((Decimal(s["total"]) for s in sales), start=Decimal("0.00"))
    chart_map: dict[str, Decimal] = {}
    for item in sales:
        if not item["created_at"]:
            continue
        day = str(item["created_at"])[:10]
        chart_map[day] = chart_map.get(day, Decimal("0.00")) + Decimal(item["total"])
    chart_data = [{"date": day, "amount": float(amount)} for day, amount in sorted(chart_map.items())]

    return {
        "total_sales_amount": str(total_sales_amount),
        "sales_count": len(sales),
        "sales": sales,
        "chart_data": chart_data,
    }


@router.get("/stock")
async def stock_report(db: AsyncSession = Depends(get_db), _: User = Depends(require_report_pin)) -> dict:
    movements = (await db.execute(select(func.count(StockMovement.id)))).scalar_one()
    return {"stock_movements": movements}


@router.get("/writeoffs")
async def writeoffs_report(
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_report_pin),
) -> dict:
    """Отчёт по списаниям (потери) за период. Группирует по категории writeoff_reason
    и считает количество позиций + сумму закупочной стоимости.
    Если у движения нет cost_price — берём текущий Product.purchase_price."""
    eff_qty = func.coalesce(StockMovement.quantity_decimal, StockMovement.quantity)
    stmt = (
        select(StockMovement, Product.name, Product.purchase_price)
        .join(Product, Product.id == StockMovement.product_id)
        .where(
            StockMovement.org_id == user.org_id,
            StockMovement.type == StockMovementType.writeoff,
            StockMovement.is_deleted.is_(False),
        )
    )
    if from_:
        stmt = stmt.where(func.date(StockMovement.created_at) >= from_)
    if to:
        stmt = stmt.where(func.date(StockMovement.created_at) <= to)
    stmt = stmt.order_by(StockMovement.created_at.desc())

    rows = (await db.execute(stmt)).all()

    by_reason: dict[str, dict] = {}
    items: list[dict] = []
    total_cost = _zero()
    total_qty = _zero()

    for m, product_name, purchase_price in rows:
        qty = Decimal(m.quantity_decimal) if m.quantity_decimal is not None else Decimal(m.quantity)
        cost_per = m.cost_price if m.cost_price is not None else (purchase_price or _zero())
        cost_total = cost_per * qty
        reason_key = m.writeoff_reason or "other"
        agg = by_reason.setdefault(reason_key, {"reason": reason_key, "count": 0, "qty": _zero(), "cost": _zero()})
        agg["count"] += 1
        agg["qty"] += qty
        agg["cost"] += cost_total
        total_cost += cost_total
        total_qty += qty
        items.append({
            "id": m.id,
            "created_at": m.created_at.isoformat() if m.created_at else None,
            "product_name": product_name,
            "qty": str(qty),
            "cost_per": str(cost_per),
            "cost_total": str(cost_total),
            "reason": reason_key,
            "comment": m.reason or "",
        })

    by_reason_list = [
        {
            "reason": v["reason"],
            "count": v["count"],
            "qty": str(v["qty"]),
            "cost": str(v["cost"]),
        }
        for v in by_reason.values()
    ]
    by_reason_list.sort(key=lambda x: -float(x["cost"]))

    return {
        "summary": {
            "count": len(items),
            "total_qty": str(total_qty),
            "total_cost": str(total_cost),
        },
        "by_reason": by_reason_list,
        "items": items,
    }


@router.get("/debt-payments")
async def debt_payments_report(
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    method: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_report_pin),
) -> dict:
    """Все погашения долга за период. Возвращает таблицу с именем клиента,
    суммой, способом, продавцом, и привязкой к продаже (если есть)."""
    stmt = (
        select(
            DebtPayment.id,
            DebtPayment.amount,
            DebtPayment.method,
            DebtPayment.comment,
            DebtPayment.created_at,
            DebtPayment.sale_id,
            Customer.id.label("customer_id"),
            Customer.name.label("customer_name"),
            Customer.phone.label("customer_phone"),
            User.name.label("created_by"),
        )
        .join(Customer, Customer.id == DebtPayment.customer_id)
        .outerjoin(User, User.id == DebtPayment.created_by_id)
    )
    if date_from:
        stmt = stmt.where(DebtPayment.created_at >= date_from)
    if date_to:
        # date_to передаётся как date (включительный последний день).
        # created_at — datetime, поэтому добавляем 1 день и сравниваем строго меньше,
        # иначе записи за «сегодня» с временем > 00:00 не попадут в выборку.
        from datetime import timedelta
        stmt = stmt.where(DebtPayment.created_at < (date_to + timedelta(days=1)))
    if method:
        stmt = stmt.where(DebtPayment.method == method)
    stmt = stmt.order_by(DebtPayment.created_at.desc())
    rows = (await db.execute(stmt)).all()

    total = sum((row.amount for row in rows), Decimal("0.00"))
    return {
        "total": float(total),
        "count": len(rows),
        "payments": [
            {
                "id": r.id,
                "amount": float(r.amount),
                "method": r.method,
                "comment": r.comment,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "customer_id": r.customer_id,
                "customer_name": r.customer_name,
                "customer_phone": r.customer_phone,
                "created_by": r.created_by,
                "sale_id": r.sale_id,
            }
            for r in rows
        ],
    }
