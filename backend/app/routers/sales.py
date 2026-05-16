from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models.customer import Customer
from app.models.product import Product
from app.models.sale import DeliveryType, Sale, SaleStatus
from app.models.sale_item import SaleItem
from app.models.serial_number import SerialNumber, SerialStatus
from app.models.stock import StockMovement, StockMovementType
from app.models.user import User
from app.models.warranty import Warranty
from app.schemas.sale import ReturnRequest, SaleCreate, SaleItemOut, SaleOut, SaleWithItemsOut
from app.services.push_service import build_payload, send_push_to_org_owners
from app.utils.receipt_pdf import generate_receipt_pdf


def _payment_type_label(sale: Sale) -> str:
    parts = []
    if sale.paid_cash and sale.paid_cash > 0:
        parts.append("наличные")
    if sale.paid_card and sale.paid_card > 0:
        parts.append("карта")
    if sale.paid_transfer and sale.paid_transfer > 0:
        parts.append("перевод")
    if sale.status == SaleStatus.debt:
        parts.append("долг")
    return " + ".join(parts) if parts else "—"

router = APIRouter(prefix="/sales", tags=["sales"])


async def _stock_balance(db: AsyncSession, product_id: int):
    """Эффективный остаток с учётом весовых товаров (Numeric) и списаний.
    in − (out + writeoff). Возвращает Decimal — корректно сравнивается с дробным item.quantity."""
    from decimal import Decimal
    eff_qty = func.coalesce(StockMovement.quantity_decimal, StockMovement.quantity)
    in_q = (
        await db.execute(
            select(func.coalesce(func.sum(eff_qty), 0)).where(
                StockMovement.product_id == product_id,
                StockMovement.type == StockMovementType.in_stock,
                StockMovement.is_deleted.is_(False),
            )
        )
    ).scalar_one()
    out_q = (
        await db.execute(
            select(func.coalesce(func.sum(eff_qty), 0)).where(
                StockMovement.product_id == product_id,
                StockMovement.type.in_([StockMovementType.out, StockMovementType.writeoff]),
                StockMovement.is_deleted.is_(False),
            )
        )
    ).scalar_one()
    return Decimal(str(in_q or 0)) - Decimal(str(out_q or 0))


async def _create_sale(payload: SaleCreate, db: AsyncSession, current_user: User) -> Sale:
    if payload.offline_id:
        # Идемпотентность: продажа с таким offline_id может быть только в этой же организации.
        # Без org_id фильтра был теоретический риск UUID-коллизии вернуть чужую продажу.
        exists = (
            await db.execute(
                select(Sale).where(
                    Sale.offline_id == payload.offline_id,
                    Sale.org_id == current_user.org_id,
                    Sale.is_deleted.is_(False),
                )
            )
        ).scalar_one_or_none()
        if exists:
            return exists

    if payload.status == "debt" and not payload.customer_id:
        raise HTTPException(status_code=400, detail="Для долга требуется выбрать клиента")

    for item in payload.items:
        # Для весовых берём реальный вес (граммы → кг), для штучных — quantity.
        from decimal import Decimal
        prod_check = (await db.execute(select(Product).where(Product.id == item.product_id))).scalar_one_or_none()
        if prod_check and getattr(prod_check, "kind", None) == "weighed" and item.weight_grams and item.weight_grams > 0:
            need = Decimal(item.weight_grams) / Decimal(1000)
        else:
            need = Decimal(str(item.quantity))
        if await _stock_balance(db, item.product_id) < need:
            raise HTTPException(status_code=400, detail=f"Недостаточно остатка по товару {item.product_id}")

    # Если у кассира открыта смена — привязываем продажу к ней (для X/Z-отчётов).
    from app.models.shift import Shift
    open_shift = (
        await db.execute(
            select(Shift).where(
                Shift.org_id == current_user.org_id,
                Shift.cashier_id == current_user.id,
                Shift.status == "open",
            )
        )
    ).scalar_one_or_none()

    sale = Sale(
        org_id=current_user.org_id,
        customer_id=payload.customer_id,
        seller_id=current_user.id,
        total=payload.total,
        paid_cash=payload.paid_cash,
        paid_card=payload.paid_card,
        paid_transfer=payload.paid_transfer,
        delivery_type=DeliveryType(payload.delivery_type),
        delivery_price=payload.delivery_price,
        delivery_address=payload.delivery_address,
        delivery_date=payload.delivery_date,
        installation=payload.installation,
        installation_price=payload.installation_price,
        status=SaleStatus(payload.status),
        offline_id=payload.offline_id,
        synced_at=datetime.now(timezone.utc) if payload.offline_id else None,
        shift_id=open_shift.id if open_shift else None,
        promised_payment_date=payload.promised_payment_date,
    )
    db.add(sale)
    await db.flush()

    for item in payload.items:
        product = (await db.execute(select(Product).where(Product.id == item.product_id))).scalar_one_or_none()
        if not product:
            raise HTTPException(status_code=404, detail="Товар не найден")
        sale_item = SaleItem(
            sale_id=sale.id,
            product_id=item.product_id,
            serial_id=item.serial_id,
            quantity=item.quantity,
            price=item.price,
            discount=item.discount,
            weight_grams=item.weight_grams,
        )
        db.add(sale_item)
        # Для весовых товаров реальное движение списания — в quantity_decimal (Numeric).
        # quantity (Integer) оставляем 0, чтобы не получить ошибку типа.
        is_weighed_movement = (
            getattr(product, "kind", None) == "weighed" and item.weight_grams and item.weight_grams > 0
        )
        if is_weighed_movement:
            from decimal import Decimal
            kg = Decimal(item.weight_grams) / Decimal(1000)
            mv = StockMovement(
                org_id=current_user.org_id,
                product_id=item.product_id,
                quantity=0,
                quantity_decimal=kg,
                type=StockMovementType.out,
                reason=f"Продажа #{sale.id}",
                created_by=current_user.id,
            )
        else:
            mv = StockMovement(
                org_id=current_user.org_id,
                product_id=item.product_id,
                quantity=int(item.quantity),
                type=StockMovementType.out,
                reason=f"Продажа #{sale.id}",
                created_by=current_user.id,
            )
        db.add(mv)
        if item.serial_id:
            serial = (await db.execute(select(SerialNumber).where(SerialNumber.id == item.serial_id))).scalar_one_or_none()
            if serial:
                serial.status = SerialStatus.sold
                serial.sale_id = sale.id

        await db.flush()
        if product.warranty_months > 0:
            issued_at = datetime.now(timezone.utc)
            expires_at = issued_at + timedelta(days=30 * product.warranty_months)
            db.add(
                Warranty(
                    org_id=current_user.org_id,
                    sale_id=sale.id,
                    sale_item_id=sale_item.id,
                    product_id=product.id,
                    serial_id=item.serial_id,
                    customer_id=payload.customer_id,
                    issued_at=issued_at,
                    expires_at=expires_at,
                )
            )

    await db.commit()
    await db.refresh(sale)
    return sale


@router.post("", response_model=SaleOut)
async def create_sale(
    payload: SaleCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Sale:
    sale = await _create_sale(payload, db, user)
    # Push владельцам — в фоне, чтобы кассир не ждал сетевой запрос Web Push сервиса.
    # Для офлайн-синхронизации (sync_sales) push не шлём: продажа уже состоялась раньше.
    background_tasks.add_task(
        send_push_to_org_owners,
        user.org_id,
        build_payload(
            "sale",
            {
                "seller_name": user.name,
                "total": float(sale.total),
                "payment_type": _payment_type_label(sale),
            },
        ),
    )
    return sale


@router.get("", response_model=list[SaleOut])
async def list_sales(
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    seller_id: int | None = Query(default=None),
    status: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[Sale]:
    stmt = select(Sale).where(Sale.is_deleted.is_(False))
    filters = []
    if date_from:
        filters.append(func.date(Sale.created_at) >= date_from)
    if date_to:
        filters.append(func.date(Sale.created_at) <= date_to)
    if seller_id:
        filters.append(Sale.seller_id == seller_id)
    if status:
        filters.append(Sale.status == SaleStatus(status))
    if filters:
        stmt = stmt.where(and_(*filters))
    return list((await db.execute(stmt.order_by(Sale.id.desc()))).scalars().all())


@router.get("/by-product/{product_id}", response_model=list[SaleWithItemsOut])
async def sales_by_product(
    product_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
) -> list[SaleWithItemsOut]:
    """Sales (status='completed') that contain the given product, newest first.
    Returns each sale with all its items and customer name — used by the Stock Return modal."""
    sales_with_product = list(
        (
            await db.execute(
                select(Sale)
                .join(SaleItem, SaleItem.sale_id == Sale.id)
                .where(
                    SaleItem.product_id == product_id,
                    Sale.org_id == user.org_id,
                    Sale.is_deleted.is_(False),
                    Sale.status == SaleStatus.completed,
                )
                .order_by(Sale.created_at.desc())
                .distinct()
            )
        ).scalars().all()
    )
    if not sales_with_product:
        return []

    sale_ids = [s.id for s in sales_with_product]
    all_items = list(
        (await db.execute(select(SaleItem).where(SaleItem.sale_id.in_(sale_ids)))).scalars().all()
    )
    product_ids = {it.product_id for it in all_items}
    products = (
        {
            p.id: p
            for p in (
                await db.execute(select(Product).where(Product.id.in_(product_ids)))
            ).scalars().all()
        }
        if product_ids
        else {}
    )
    customer_ids = {s.customer_id for s in sales_with_product if s.customer_id}
    customers = (
        {
            c.id: c
            for c in (
                await db.execute(select(Customer).where(Customer.id.in_(customer_ids)))
            ).scalars().all()
        }
        if customer_ids
        else {}
    )

    items_by_sale: dict[int, list[SaleItem]] = {}
    for it in all_items:
        items_by_sale.setdefault(it.sale_id, []).append(it)

    out: list[SaleWithItemsOut] = []
    for sale in sales_with_product:
        items_payload = [
            SaleItemOut(
                id=it.id,
                product_id=it.product_id,
                product_name=products[it.product_id].name if it.product_id in products else None,
                quantity=it.quantity,
                price=it.price,
            )
            for it in items_by_sale.get(sale.id, [])
        ]
        out.append(
            SaleWithItemsOut(
                id=sale.id,
                customer_id=sale.customer_id,
                customer_name=customers[sale.customer_id].name
                if sale.customer_id and sale.customer_id in customers
                else None,
                seller_id=sale.seller_id,
                total=sale.total,
                status=sale.status.value,
                created_at=sale.created_at,
                items=items_payload,
            )
        )
    return out


@router.post("/{sale_id}/return")
async def return_sale_items(
    sale_id: int,
    payload: ReturnRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Return selected items from a completed sale: stock back, mark sale 'returned' if all items returned."""
    sale = (
        await db.execute(
            select(Sale).where(
                Sale.id == sale_id,
                Sale.org_id == user.org_id,
                Sale.is_deleted.is_(False),
            )
        )
    ).scalar_one_or_none()
    if not sale:
        raise HTTPException(status_code=404, detail="Продажа не найдена")
    # NB: status == returned больше не блокируем целиком — позиции защищены через returned_at.
    # Это позволяет частичные возвраты разными чеками.
    if not payload.return_item_ids:
        raise HTTPException(status_code=400, detail="Не выбрано ни одной позиции для возврата")

    all_sale_items = list(
        (await db.execute(select(SaleItem).where(SaleItem.sale_id == sale.id))).scalars().all()
    )
    # Защита от двойного возврата: позиции с returned_at уже возвращены, игнорируем.
    items_to_return = [
        it for it in all_sale_items
        if it.id in payload.return_item_ids and it.returned_at is None
    ]
    if not items_to_return:
        raise HTTPException(
            status_code=400,
            detail="Все указанные позиции уже были возвращены ранее или не принадлежат этой продаже",
        )

    # Подгружаем продукты возвращаемых позиций — нужно чтобы понять weighed/штучный.
    return_product_ids = {it.product_id for it in items_to_return}
    return_products = {
        p.id: p
        for p in (
            await db.execute(select(Product).where(Product.id.in_(return_product_ids)))
        ).scalars().all()
    }

    reason = (payload.reason or "Возврат от клиента").strip()
    return_total = Decimal("0")
    for it in items_to_return:
        prod = return_products.get(it.product_id)
        is_weighed = prod is not None and getattr(prod, "kind", None) == "weighed" and it.weight_grams and it.weight_grams > 0
        if is_weighed:
            eff_qty = Decimal(it.weight_grams) / Decimal(1000)
            qty_int = 0
            qty_dec: Decimal | None = eff_qty
        else:
            eff_qty = Decimal(it.quantity)
            qty_int = it.quantity
            qty_dec = None
        db.add(
            StockMovement(
                org_id=sale.org_id,
                product_id=it.product_id,
                quantity=qty_int,
                quantity_decimal=qty_dec,
                type=StockMovementType.in_stock,
                reason=f"Возврат продажи #{sale.id}: {reason}",
                created_by=user.id,
            )
        )
        return_total += (it.price or Decimal("0")) * eff_qty
        # Помечаем позицию возвращённой — повторный возврат той же позиции не сработает.
        it.returned_at = datetime.now(timezone.utc)

    # Уменьшаем total продажи и пропорционально вычитаем оплату по способам.
    # Это нужно чтобы:
    #   1) выручка в /reports/summary не учитывала возвращённые деньги;
    #   2) X/Z-отчёт смены показывал корректный «должно быть наличных»;
    #   3) долг по частично-оплаченной продаже корректно уменьшался.
    paid_total_before = (sale.paid_cash or Decimal("0")) + (sale.paid_card or Decimal("0")) + (sale.paid_transfer or Decimal("0"))
    cash_back = Decimal("0")
    card_back = Decimal("0")
    transfer_back = Decimal("0")
    if paid_total_before > 0:
        # Не уходим в минус: возврат «оплаченной части» = min(return_total, paid_total_before).
        refund_paid = min(return_total, paid_total_before)
        portion = refund_paid / paid_total_before
        cash_back = (sale.paid_cash or Decimal("0")) * portion
        card_back = (sale.paid_card or Decimal("0")) * portion
        transfer_back = (sale.paid_transfer or Decimal("0")) * portion
        sale.paid_cash = (sale.paid_cash or Decimal("0")) - cash_back
        sale.paid_card = (sale.paid_card or Decimal("0")) - card_back
        sale.paid_transfer = (sale.paid_transfer or Decimal("0")) - transfer_back
    sale.total = max(Decimal("0"), (sale.total or Decimal("0")) - return_total)

    # Если ВСЕ позиции продажи теперь возвращены (с учётом прошлых частичных) — статус returned.
    # И обнуляем хвосты округления: при пропорциональном возврате весовых товаров
    # могут остаться копейки в total/paid_*, искажающие отчёты.
    if all(it.returned_at is not None for it in all_sale_items):
        sale.status = SaleStatus.returned
        sale.total = Decimal("0")
        sale.paid_cash = Decimal("0")
        sale.paid_card = Decimal("0")
        sale.paid_transfer = Decimal("0")

    await db.commit()

    # Для push: имя первого товара возврата.
    first_product_name: str | None = None
    if items_to_return:
        first_item = items_to_return[0]
        prod = return_products.get(first_item.product_id)
        first_product_name = prod.name if prod else f"товар #{first_item.product_id}"
    label = first_product_name or "—"
    if len(items_to_return) > 1:
        label = f"{label} +{len(items_to_return) - 1}"

    background_tasks.add_task(
        send_push_to_org_owners,
        sale.org_id,
        build_payload(
            "return",
            {
                "seller_name": user.name,
                "product_name": label,
                "amount": float(return_total),
            },
        ),
    )
    return {
        "detail": "Возврат проведён",
        "returned_items": len(items_to_return),
        "sale_status": sale.status.value,
    }


@router.get("/{sale_id}", response_model=SaleOut)
async def get_sale(sale_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)) -> Sale:
    sale = (await db.execute(select(Sale).where(Sale.id == sale_id, Sale.is_deleted.is_(False)))).scalar_one_or_none()
    if not sale:
        raise HTTPException(status_code=404, detail="Продажа не найдена")
    return sale


@router.get("/{sale_id}/receipt")
async def receipt(sale_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)) -> FileResponse:
    sale = (
        await db.execute(
            select(Sale).where(
                Sale.id == sale_id, Sale.org_id == user.org_id, Sale.is_deleted.is_(False)
            )
        )
    ).scalar_one_or_none()
    if not sale:
        raise HTTPException(status_code=404, detail="Продажа не найдена")

    items = list(
        (await db.execute(select(SaleItem).where(SaleItem.sale_id == sale.id))).scalars().all()
    )
    product_ids = [i.product_id for i in items]
    products = {
        p.id: p
        for p in (
            await db.execute(select(Product).where(Product.id.in_(product_ids)))
        ).scalars().all()
    } if product_ids else {}

    seller = (
        await db.execute(select(User).where(User.id == sale.seller_id))
    ).scalar_one_or_none()
    customer = None
    if sale.customer_id:
        customer = (
            await db.execute(select(Customer).where(Customer.id == sale.customer_id))
        ).scalar_one_or_none()

    rows: list[tuple[str, int, Decimal]] = []
    subtotal = Decimal("0.00")
    discount_amount = Decimal("0.00")
    for it in items:
        prod = products.get(it.product_id)
        name = prod.name if prod else f"Товар #{it.product_id}"
        line = it.price * it.quantity
        subtotal += line
        # SaleItem.discount stored as percent applied per line (matches frontend payload).
        discount_amount += line * (it.discount / Decimal("100"))
        rows.append((name, it.quantity, it.price))

    pdf_path = generate_receipt_pdf(
        sale_id=sale.id,
        sale_date=sale.created_at,
        seller_name=seller.name if seller else "—",
        customer_name=customer.name if customer else None,
        items=rows,
        subtotal=subtotal,
        discount_amount=discount_amount,
        delivery_price=sale.delivery_price if sale.delivery_type == DeliveryType.separate else Decimal("0.00"),
        installation_price=sale.installation_price if sale.installation else Decimal("0.00"),
        total=sale.total,
        paid_cash=sale.paid_cash,
        paid_card=sale.paid_card,
        paid_transfer=sale.paid_transfer,
    )
    return FileResponse(pdf_path, media_type="application/pdf", filename=f"receipt_{sale.id}.pdf")


@router.put("/{sale_id}")
async def update_sale(sale_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(require_role("owner"))) -> dict:
    sale = (await db.execute(select(Sale).where(Sale.id == sale_id, Sale.is_deleted.is_(False)))).scalar_one_or_none()
    if not sale:
        raise HTTPException(status_code=404, detail="Продажа не найдена")
    return {"detail": "Изменение продаж доступно только owner и реализуется отдельным DTO"}


@router.put("/{sale_id}/promised-date")
async def set_promised_payment_date(
    sale_id: int,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Устанавливает/убирает дату обещанного возврата долга. Тело: {"date": "YYYY-MM-DD" | null}.
    Имеет смысл только для продаж со статусом debt — иначе напоминание никогда не сработает."""
    sale = (
        await db.execute(
            select(Sale).where(
                Sale.id == sale_id,
                Sale.org_id == user.org_id,
                Sale.is_deleted.is_(False),
            )
        )
    ).scalar_one_or_none()
    if not sale:
        raise HTTPException(status_code=404, detail="Продажа не найдена")
    raw = payload.get("date")
    if raw is None or raw == "":
        sale.promised_payment_date = None
    else:
        try:
            sale.promised_payment_date = date.fromisoformat(str(raw))
        except ValueError:
            raise HTTPException(status_code=400, detail="Неверный формат даты, ожидается YYYY-MM-DD")
    await db.commit()
    return {
        "id": sale.id,
        "promised_payment_date": sale.promised_payment_date.isoformat() if sale.promised_payment_date else None,
    }


@router.delete("/{sale_id}")
async def delete_sale(sale_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(require_role("owner"))) -> dict:
    sale = (await db.execute(select(Sale).where(Sale.id == sale_id, Sale.is_deleted.is_(False)))).scalar_one_or_none()
    if not sale:
        raise HTTPException(status_code=404, detail="Продажа не найдена")
    sale.is_deleted = True
    sale.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return {"detail": "Продажа удалена"}


@router.post("/sync", response_model=list[SaleOut])
async def sync_sales(
    payload: list[SaleCreate], db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
) -> list[Sale]:
    synced: list[Sale] = []
    for sale_input in payload:
        synced.append(await _create_sale(sale_input, db, user))
    return synced
