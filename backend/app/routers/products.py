import secrets

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import Response

from app.database import get_db
from app.dependencies import get_current_user, owner_only_price
from app.models.organization import Organization
from app.models.product import Product
from app.models.user import User
from app.schemas.product import ProductCreate, ProductOut, ProductUpdate
from app.utils.barcode import generate_ean13
from app.utils.barcode_image import ean13_png_bytes

router = APIRouter(prefix="/products", tags=["products"])


@router.get("")
async def list_products(
    q: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[dict]:
    stmt = select(Product).where(Product.is_deleted.is_(False))
    if q:
        # Поиск по названию ИЛИ по подстроке штрихкода — пригождается когда у товара
        # стёрся/повреждён штрихкод и продавец вводит видимый фрагмент.
        pattern = f"%{q}%"
        stmt = stmt.where(or_(Product.name.ilike(pattern), Product.barcode.ilike(pattern)))
    result = await db.execute(stmt.order_by(Product.id.desc()))
    products = [ProductOut.model_validate(p).model_dump() for p in result.scalars().all()]
    return [owner_only_price(p, _) for p in products]


async def _check_plu_unique(
    db: AsyncSession, org_id: int, weighing_code: str | None, exclude_id: int | None = None
) -> None:
    """Если weighing_code задан — проверить, что его ещё никто в организации не использует.
    При обновлении exclude_id = id текущего товара (не считать его конфликтом с самим собой)."""
    if not weighing_code:
        return
    q = select(Product).where(
        Product.org_id == org_id,
        Product.weighing_code == weighing_code,
        Product.is_deleted.is_(False),
    )
    if exclude_id is not None:
        q = q.where(Product.id != exclude_id)
    existing = (await db.execute(q)).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"PLU «{weighing_code}» уже используется товаром «{existing.name}». Укажите другой код.",
        )


async def _check_barcodes_unique(
    db: AsyncSession,
    org_id: int,
    barcode: str | None,
    extra_barcodes: list[str] | None,
    exclude_id: int | None = None,
) -> None:
    """Любой ШК (основной или дополнительный) не должен быть занят в этой организации
    другим товаром — ни как barcode, ни как элемент extra_barcodes."""
    from sqlalchemy import or_
    all_codes: list[str] = []
    if barcode and str(barcode).strip():
        all_codes.append(str(barcode).strip())
    for c in (extra_barcodes or []):
        c_clean = str(c).strip()
        if c_clean and c_clean not in all_codes:
            all_codes.append(c_clean)
    if not all_codes:
        return
    extra_conds = [Product.extra_barcodes.contains([c]) for c in all_codes]
    q = select(Product).where(
        Product.org_id == org_id,
        Product.is_deleted.is_(False),
        or_(Product.barcode.in_(all_codes), *extra_conds),
    )
    if exclude_id is not None:
        q = q.where(Product.id != exclude_id)
    other = (await db.execute(q)).scalars().first()
    if other:
        raise HTTPException(
            status_code=409,
            detail=f"Один из штрихкодов уже используется товаром «{other.name}». Укажите другой.",
        )


@router.post("", response_model=ProductOut)
async def create_product(
    payload: ProductCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Product:
    data = payload.model_dump()
    gen = data.pop("barcode_generated", False)
    barcode_val = data.pop("barcode")

    await _check_plu_unique(db, current_user.org_id, data.get("weighing_code"))
    # Проверка дубля штрихкодов (основной + extra). Для автогенерации barcode проверяем только extra.
    await _check_barcodes_unique(
        db,
        current_user.org_id,
        None if gen else (str(barcode_val).strip() if barcode_val else None),
        data.get("extra_barcodes"),
    )

    if gen:
        temp_barcode = f"2{secrets.randbelow(10**12):012d}"
        product = Product(
            org_id=current_user.org_id,
            **data,
            barcode=temp_barcode,
            barcode_generated=True,
        )
    else:
        product = Product(
            org_id=current_user.org_id,
            **data,
            barcode=str(barcode_val).strip(),
            barcode_generated=False,
        )
    db.add(product)
    await db.flush()
    if gen:
        product.barcode = generate_ean13(product.id)
        product.barcode_generated = True
    await db.commit()
    await db.refresh(product)
    return product


def _parse_weighed_barcode(raw: str, org: Organization) -> tuple[str, int] | None:
    """Если магазин поддерживает весовые товары и raw имеет формат
    <prefix><code><grams><check>, длина 13, возвращает (code, grams).
    Иначе None."""
    if not org.has_weighed_products:
        return None
    prefix = (org.weighed_barcode_prefix or "").strip()
    code_len = org.weighed_code_length or 0
    grams_len = org.weighed_grams_length or 0
    if not prefix or code_len <= 0 or grams_len <= 0:
        return None
    if len(raw) != 13 or not raw.isdigit():
        return None
    if not raw.startswith(prefix):
        return None
    code = raw[len(prefix) : len(prefix) + code_len]
    grams_str = raw[len(prefix) + code_len : len(prefix) + code_len + grams_len]
    if len(code) != code_len or len(grams_str) != grams_len:
        return None
    try:
        return code, int(grams_str)
    except ValueError:
        return None


@router.get("/plu/{code}")
async def by_plu(
    code: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
) -> dict:
    """Поиск товара по PLU/weighing_code в текущем магазине. Используется в
    «быстрой кассе» для grocery: кассир вводит цифровой код товара, потом
    отдельно указывает вес. Возвращает плоский Product (как /barcode)."""
    cleaned = (code or "").strip()
    if not cleaned.isdigit():
        raise HTTPException(status_code=400, detail="PLU должен быть цифрой")
    products = (
        await db.execute(
            select(Product).where(
                Product.org_id == current_user.org_id,
                Product.weighing_code == cleaned,
                Product.is_deleted.is_(False),
            )
        )
    ).scalars().all()
    if not products:
        raise HTTPException(status_code=404, detail="Товар по PLU не найден")
    if len(products) > 1:
        names = ", ".join(p.name for p in products[:5])
        raise HTTPException(
            status_code=409,
            detail=f"PLU {cleaned} назначен нескольким товарам ({len(products)}): {names}. Сделайте PLU уникальным в карточках.",
        )
    return owner_only_price(ProductOut.model_validate(products[0]).model_dump(), current_user)


@router.get("/barcode/{barcode}")
async def by_barcode(
    barcode: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Поиск товара по штрихкоду. Сначала пробуем разобрать как весовой
    (если магазин поддерживает) — извлекаем код товара и вес в граммах,
    ищем Product по weighing_code. Иначе — обычный поиск по barcode.

    Возвращает плоский Product (как раньше) плюс опциональное поле
    `weight_grams` (null для штучных, число для весовых). Старый фронт,
    игнорирующий weight_grams, продолжит работать."""
    raw = (barcode or "").strip()
    digits_only = "".join(ch for ch in raw if ch.isdigit())
    weight_grams: int | None = None
    matched: Product | None = None

    # 1) Попытка распознать весовой штрихкод
    org = (
        await db.execute(select(Organization).where(Organization.id == current_user.org_id))
    ).scalar_one_or_none()
    if org is not None:
        parsed = _parse_weighed_barcode(digits_only or raw, org)
        if parsed:
            code, grams = parsed
            matched = (
                await db.execute(
                    select(Product).where(
                        Product.org_id == org.id,
                        Product.weighing_code == code,
                        Product.kind == "weighed",
                        Product.is_deleted.is_(False),
                    )
                )
            ).scalar_one_or_none()
            if matched:
                weight_grams = grams

    # 2) Обычный поиск по barcode (если не нашли весовой).
    # Сначала по основному barcode, затем по extra_barcodes (несколько ШК на один товар).
    if not matched:
        candidates = {raw}
        if digits_only:
            candidates.add(digits_only)
            if len(digits_only) == 12:
                candidates.add("0" + digits_only)
            if len(digits_only) == 13 and digits_only.startswith("0"):
                candidates.add(digits_only[1:])
        from sqlalchemy import or_
        candidate_list = list(candidates)
        # extra_barcodes JSONB contains: для каждого варианта проверяем @> '[X]'
        extra_conds = [Product.extra_barcodes.contains([c]) for c in candidate_list]
        matched = (
            await db.execute(
                select(Product).where(
                    Product.is_deleted.is_(False),
                    or_(Product.barcode.in_(candidate_list), *extra_conds),
                )
            )
        ).scalars().first()

    if not matched:
        raise HTTPException(status_code=404, detail="Товар не найден")
    payload = owner_only_price(ProductOut.model_validate(matched).model_dump(), current_user)
    payload["weight_grams"] = weight_grams
    return payload


@router.get("/{product_id}/barcode/image")
async def product_barcode_image(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    result = await db.execute(
        select(Product).where(
            Product.id == product_id,
            Product.org_id == current_user.org_id,
            Product.is_deleted.is_(False),
        )
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Товар не найден")
    try:
        png = ean13_png_bytes(product.barcode)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return Response(content=png, media_type="image/png")


@router.put("/{product_id}")
async def update_product(
    product_id: int,
    payload: ProductUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> dict:
    result = await db.execute(select(Product).where(Product.id == product_id, Product.is_deleted.is_(False)))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Товар не найден")

    update_data = payload.model_dump(exclude_unset=True)
    if "weighing_code" in update_data:
        await _check_plu_unique(db, product.org_id, update_data["weighing_code"], exclude_id=product.id)
    if "barcode" in update_data or "extra_barcodes" in update_data:
        new_barcode = update_data.get("barcode", product.barcode)
        new_extras = update_data.get("extra_barcodes", product.extra_barcodes)
        await _check_barcodes_unique(
            db, product.org_id, new_barcode, new_extras, exclude_id=product.id,
        )
    for field, value in update_data.items():
        setattr(product, field, value)
    await db.commit()
    await db.refresh(product)
    return owner_only_price(ProductOut.model_validate(product).model_dump(), _)


@router.get("/{product_id}")
async def get_product(
    product_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)
) -> dict:
    result = await db.execute(select(Product).where(Product.id == product_id, Product.is_deleted.is_(False)))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Товар не найден")
    return owner_only_price(ProductOut.model_validate(product).model_dump(), _)
