from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models.product import Product
from app.models.stock import StockMovement, StockMovementType
from app.models.user import User
from app.schemas.stock import RevisionApply, StockMovementCreate, StockSummary
from app.services.push_service import build_payload, send_push_to_org_owners

router = APIRouter(prefix="/stock", tags=["stock"])


@router.get("/revisions/last")
async def last_revision(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Последняя завершённая ревизия. Группируем StockMovement с reason начинающимся
    на 'Ревизия склада' в одну ревизию по интервалу: ±60 сек от самого свежего."""
    import re
    from datetime import timedelta

    last_row = (
        await db.execute(
            select(StockMovement)
            .where(
                StockMovement.org_id == user.org_id,
                StockMovement.reason.like("Ревизия склада%"),
            )
            .order_by(StockMovement.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if not last_row or not last_row.created_at:
        return {"found": False}

    window_start = last_row.created_at - timedelta(seconds=60)
    window_end = last_row.created_at + timedelta(seconds=60)

    movements = list(
        (
            await db.execute(
                select(StockMovement, Product.name)
                .outerjoin(Product, Product.id == StockMovement.product_id)
                .where(
                    StockMovement.org_id == user.org_id,
                    StockMovement.reason.like("Ревизия склада%"),
                    StockMovement.created_at >= window_start,
                    StockMovement.created_at <= window_end,
                )
                .order_by(StockMovement.id.asc())
            )
        ).all()
    )

    # Парсим reason формата "Ревизия склада: сист {N} → факт {M}".
    pattern = re.compile(r"сист\s+(-?\d+)\s+→\s+факт\s+(-?\d+)")

    # Для старых ревизий (без подробностей в reason) вычислим текущие остатки —
    # факт ≈ current_balance, expected = current_balance − delta.
    # Это точно если после ревизии не было других движений по этим товарам.
    product_ids_in_revision = list({m.product_id for m, _ in movements})
    current_balance: dict[int, int] = {}
    product_prices: dict[int, tuple[float, float]] = {}
    if product_ids_in_revision:
        bal_rows = (
            await db.execute(
                select(
                    StockMovement.product_id,
                    func.sum(
                        case(
                            (StockMovement.type == StockMovementType.in_stock, StockMovement.quantity),
                            else_=-StockMovement.quantity,
                        )
                    ).label("balance"),
                )
                .where(StockMovement.product_id.in_(product_ids_in_revision))
                .group_by(StockMovement.product_id)
            )
        ).all()
        current_balance = {pid: int(b or 0) for pid, b in bal_rows}

        # Цены: закупочная и продажная — для расчёта стоимости недостач/излишков.
        price_rows = (
            await db.execute(
                select(Product.id, Product.purchase_price, Product.sale_price)
                .where(Product.id.in_(product_ids_in_revision))
            )
        ).all()
        product_prices = {pid: (float(pp or 0), float(sp or 0)) for pid, pp, sp in price_rows}

    surplus = 0
    shortage = 0
    surplus_value_purchase = 0.0
    shortage_value_purchase = 0.0
    surplus_value_sale = 0.0
    shortage_value_sale = 0.0
    items = []
    for m, name in movements:
        is_in = m.type == StockMovementType.in_stock
        delta = m.quantity if is_in else -m.quantity
        if delta > 0:
            surplus += delta
        else:
            shortage += -delta

        expected_qty: int | None = None
        actual_qty: int | None = None
        if m.reason:
            match = pattern.search(m.reason)
            if match:
                try:
                    expected_qty = int(match.group(1))
                    actual_qty = int(match.group(2))
                except ValueError:
                    pass

        # Fallback: вычислить из текущих остатков (для старых ревизий без подробностей).
        if expected_qty is None or actual_qty is None:
            cur = current_balance.get(m.product_id)
            if cur is not None:
                actual_qty = cur
                expected_qty = cur - delta

        purchase_price, sale_price = product_prices.get(m.product_id, (0.0, 0.0))
        purchase_value = delta * purchase_price
        sale_value = delta * sale_price
        if delta > 0:
            surplus_value_purchase += purchase_value
            surplus_value_sale += sale_value
        else:
            shortage_value_purchase += -purchase_value
            shortage_value_sale += -sale_value

        items.append(
            {
                "product_id": m.product_id,
                "product_name": name,
                "delta": delta,
                "type": "Излишек" if is_in else "Недостача",
                "quantity": m.quantity,
                "expected_qty": expected_qty,
                "actual_qty": actual_qty,
                "purchase_price": purchase_price,
                "sale_price": sale_price,
                "purchase_value": round(purchase_value, 2),
                "sale_value": round(sale_value, 2),
            }
        )

    creator_id = movements[0][0].created_by if movements else None
    creator = None
    if creator_id:
        creator = (
            await db.execute(select(User).where(User.id == creator_id))
        ).scalar_one_or_none()

    return {
        "found": True,
        "completed_at": last_row.created_at.isoformat(),
        "by_user": creator.name if creator else None,
        "surplus": surplus,
        "shortage": shortage,
        "surplus_value_purchase": round(surplus_value_purchase, 2),
        "shortage_value_purchase": round(shortage_value_purchase, 2),
        "surplus_value_sale": round(surplus_value_sale, 2),
        "shortage_value_sale": round(shortage_value_sale, 2),
        "items_count": len(items),
        "items": items,
    }


@router.get("/movements")
async def list_movements(
    limit: int = Query(default=200, le=2000),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict]:
    """История движений склада. Используется фронтом и для таблицы движений,
    и для сортировки товаров по последнему приходу."""
    rows = list(
        (
            await db.execute(
                select(StockMovement, User.name.label("created_by_name"))
                .outerjoin(User, StockMovement.created_by == User.id)
                .where(StockMovement.org_id == user.org_id)
                .order_by(StockMovement.id.desc())
                .limit(limit)
            )
        ).all()
    )
    return [
        {
            "id": r.StockMovement.id,
            "product_id": r.StockMovement.product_id,
            "type": r.StockMovement.type.value,
            # Для весовых товаров реальное количество — quantity_decimal, для штучных — quantity.
            "quantity": float(r.StockMovement.quantity_decimal)
                if r.StockMovement.quantity_decimal is not None
                else r.StockMovement.quantity,
            "reason": r.StockMovement.reason,
            "created_at": r.StockMovement.created_at.isoformat() if r.StockMovement.created_at else None,
            "created_by_name": r.created_by_name,
        }
        for r in rows
    ]


@router.get("", response_model=list[StockSummary])
async def stock_summary(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)) -> list[StockSummary]:
    # Для весовых товаров фактическое количество хранится в quantity_decimal (Numeric),
    # для штучных — в quantity (Integer). COALESCE даёт «эффективное» количество.
    eff_qty = func.coalesce(StockMovement.quantity_decimal, StockMovement.quantity)
    in_sum = func.coalesce(
        func.sum(case((StockMovement.type == StockMovementType.in_stock, eff_qty), else_=0)), 0
    )
    # Расходом со склада считаем как продажи (out), так и списания (writeoff).
    out_sum = func.coalesce(
        func.sum(case(
            (StockMovement.type.in_([StockMovementType.out, StockMovementType.writeoff]), eff_qty),
            else_=0,
        )), 0
    )
    min_expiry = func.min(
        case((StockMovement.type == StockMovementType.in_stock, StockMovement.expiry_date))
    )
    # Последняя закупочная цена: max(cost_price) по приходам с непустым cost_price.
    # Упрощение — берём максимум как «недавно зафиксированную». Точная FIFO/средневзв.
    # себестоимость требует отдельной таблицы партий и отложена на следующую фазу.
    last_cost = func.max(
        case((
            (StockMovement.type == StockMovementType.in_stock) & (StockMovement.cost_price.is_not(None)),
            StockMovement.cost_price,
        ))
    )
    stmt = (
        select(
            Product.id,
            Product.name,
            Product.barcode,
            Product.sale_price,
            in_sum.label("in_qty"),
            out_sum.label("out_qty"),
            min_expiry.label("min_expiry_date"),
            last_cost.label("last_cost_price"),
        )
        .outerjoin(StockMovement, Product.id == StockMovement.product_id)
        .where(Product.is_deleted.is_(False))
        .group_by(Product.id)
    )
    rows = (await db.execute(stmt)).all()
    out: list[StockSummary] = []
    for row in rows:
        cost = row.last_cost_price
        sale = row.sale_price
        margin: float | None = None
        try:
            if cost and sale and float(sale) > 0:
                margin = round((float(sale) - float(cost)) / float(sale) * 100.0, 2)
        except (TypeError, ValueError):
            margin = None
        out.append(
            StockSummary(
                product_id=row.id,
                name=row.name,
                barcode=row.barcode,
                in_qty=row.in_qty,
                out_qty=row.out_qty,
                balance=row.in_qty - row.out_qty,
                min_expiry_date=row.min_expiry_date,
                last_cost_price=cost,
                margin_pct=margin,
            )
        )
    return out


@router.post("/movement")
async def create_movement(
    payload: StockMovementCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    if payload.type not in {m.value for m in StockMovementType}:
        raise HTTPException(status_code=400, detail="Неверный тип движения склада")
    if payload.type == "writeoff":
        await require_role("owner", "warehouse")(current_user)

    product = (
        await db.execute(select(Product).where(Product.id == payload.product_id, Product.is_deleted.is_(False)))
    ).scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Товар не найден")

    # Категория списания пишем только для writeoff — для in/out игнорируем,
    # чтобы случайно не «загрязнить» данные.
    writeoff_reason = payload.writeoff_reason if payload.type == "writeoff" else None
    movement = StockMovement(
        org_id=current_user.org_id,
        product_id=payload.product_id,
        quantity=payload.quantity,
        type=StockMovementType(payload.type),
        reason=payload.reason,
        supplier=payload.supplier,
        invoice_number=payload.invoice_number,
        production_date=payload.production_date,
        expiry_date=payload.expiry_date,
        batch_number=payload.batch_number,
        supplier_id=payload.supplier_id,
        cost_price=payload.cost_price,
        quantity_decimal=payload.quantity_decimal,
        writeoff_reason=writeoff_reason,
        created_by=current_user.id,
    )
    db.add(movement)
    # При приходе с указанной cost_price синхронизируем Product.purchase_price (последняя закупка).
    # Чтобы в карточке/списке товара актуальная цена закупки была видна сразу.
    if payload.type == "in" and payload.cost_price is not None and payload.cost_price > 0:
        product.purchase_price = payload.cost_price
    await db.commit()

    # Push только на списания. Поступления и продажи через касса покрыты другими событиями.
    if payload.type == "writeoff":
        background_tasks.add_task(
            send_push_to_org_owners,
            current_user.org_id,
            build_payload(
                "writeoff",
                {
                    "seller_name": current_user.name,
                    "product_name": product.name,
                    "reason": (payload.reason or "не указана").strip() or "не указана",
                },
            ),
        )
    return {"detail": "Движение сохранено"}


@router.post("/revision")
async def apply_revision(
    payload: RevisionApply,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    await require_role("owner", "warehouse", "seller")(current_user)

    from decimal import Decimal as _D
    for item in payload.items:
        if item.actual_qty < 0:
            raise HTTPException(status_code=400, detail="Фактический остаток не может быть отрицательным")
        delta = item.actual_qty - item.expected_qty
        if delta == 0:
            continue

        result = await db.execute(
            select(Product).where(
                Product.id == item.product_id,
                Product.org_id == current_user.org_id,
                Product.is_deleted.is_(False),
            )
        )
        product = result.scalar_one_or_none()
        if not product:
            raise HTTPException(status_code=404, detail=f"Товар не найден (id={item.product_id})")

        qty_abs = abs(delta)
        is_weighed = getattr(product, "kind", None) == "weighed"
        # Для весовых пишем дробное в quantity_decimal, для штучных — целое в quantity.
        if is_weighed:
            qty_int = 0
            qty_dec: _D | None = qty_abs
        else:
            qty_int = int(qty_abs)
            qty_dec = None
        movement = StockMovement(
            org_id=current_user.org_id,
            product_id=item.product_id,
            quantity=qty_int,
            quantity_decimal=qty_dec,
            type=StockMovementType.in_stock if delta > 0 else StockMovementType.out,
            reason=f"Ревизия склада: сист {item.expected_qty} → факт {item.actual_qty}",
            created_by=current_user.id,
        )
        db.add(movement)

    await db.commit()
    return {"detail": "Ревизия сохранена"}
