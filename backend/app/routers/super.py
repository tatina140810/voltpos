"""Super-admin (platform-level) endpoints — управление магазинами, их сотрудниками
и подписками. Все эндпоинты требуют platform-JWT (отдельный от кассирского)."""

from __future__ import annotations

import random
import re
import string
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_platform_admin
from app.models.organization import Organization, OrganizationPlan
from app.models.payment import Payment
from app.models.platform_admin import PlatformAdmin
from app.models.product import Product
from app.models.stock import StockMovement, StockMovementType
from app.models.user import User, UserRole
from app.data.business_templates import BUSINESS_TEMPLATES
from app.schemas.super import (
    ApplyBusinessTypeRequest,
    BusinessTemplateItem,
    DashboardStats,
    ImportErrorItem,
    ImportResult,
    OrgCreateRequest,
    OrgDetails,
    OrgEmployee,
    OrgEmployeeCreate,
    OrgEmployeeUpdate,
    OrgListItem,
    OrgUpdateRequest,
    PaymentCreate,
    PaymentItem,
    UpdateModulesRequest,
    WeighedConfig,
)
from app.utils.products_import import parse_umag_xlsx
from app.utils.security import get_password_hash
from app.utils.store_categories import STORE_CATEGORIES, STORE_CATEGORIES_SET

router = APIRouter(prefix="/super", tags=["super"], dependencies=[Depends(get_current_platform_admin)])


def _validate_category(value: str | None) -> str | None:
    if value is None or value == "":
        return None
    if value not in STORE_CATEGORIES_SET:
        raise HTTPException(status_code=422, detail=f"Категория '{value}' не из списка допустимых")
    return value


def _weighed_config(org: Organization) -> WeighedConfig:
    return WeighedConfig(
        enabled=org.has_weighed_products,
        prefix=org.weighed_barcode_prefix,
        code_length=org.weighed_code_length,
        grams_length=org.weighed_grams_length,
    )


def _validate_weighed_format(org: Organization) -> None:
    """Если фича включена, формат должен быть полным и корректным.
    Сумма префикса, длины кода и длины граммов + 1 контрольная цифра = 13 (EAN-13)."""
    if not org.has_weighed_products:
        return
    prefix = (org.weighed_barcode_prefix or "").strip()
    code_len = org.weighed_code_length or 0
    grams_len = org.weighed_grams_length or 0
    if not prefix or code_len <= 0 or grams_len <= 0:
        raise HTTPException(
            status_code=422,
            detail="Для весовых товаров нужно указать префикс, длину кода и длину граммов",
        )
    total = len(prefix) + code_len + grams_len + 1  # +1 = контрольная цифра EAN-13
    if total != 13:
        raise HTTPException(
            status_code=422,
            detail=f"Формат должен умещаться в 13 цифр EAN-13: префикс({len(prefix)}) + код({code_len}) + граммы({grams_len}) + контр.(1) = {total}",
        )


@router.get("/categories", response_model=list[str])
async def list_store_categories() -> list[str]:
    return STORE_CATEGORIES


@router.get("/business/templates", response_model=list[BusinessTemplateItem])
async def list_business_templates() -> list[BusinessTemplateItem]:
    return [
        BusinessTemplateItem(
            key=key,
            name=t["name"],
            icon=t["icon"],
            units=list(t["units"]),
            modules=dict(t["modules"]),
            default_categories=list(t["default_categories"]),
        )
        for key, t in BUSINESS_TEMPLATES.items()
    ]


@router.post("/orgs/{org_id}/business-type", response_model=OrgDetails)
async def apply_business_type(
    org_id: int, payload: ApplyBusinessTypeRequest, db: AsyncSession = Depends(get_db)
) -> OrgDetails:
    """Применяет шаблон бизнеса: записывает business_type и копирует modules
    из шаблона в business_settings.modules. override_modules позволяет в этом
    же запросе докрутить часть модулей вручную (например, оставить delivery=True
    для пресета, где он по дефолту off)."""
    if payload.business_type not in BUSINESS_TEMPLATES:
        raise HTTPException(status_code=422, detail=f"Шаблон '{payload.business_type}' не существует")
    template = BUSINESS_TEMPLATES[payload.business_type]
    org = await _get_org_or_404(db, org_id)

    modules = dict(template["modules"])
    if payload.override_modules:
        modules.update(payload.override_modules)

    settings = dict(org.business_settings or {})
    settings["modules"] = modules
    settings["units"] = list(template["units"])

    org.business_type = payload.business_type
    org.business_settings = settings
    await db.commit()
    return await get_org(org_id, db)


@router.patch("/orgs/{org_id}/modules", response_model=OrgDetails)
async def update_modules(
    org_id: int, payload: UpdateModulesRequest, db: AsyncSession = Depends(get_db)
) -> OrgDetails:
    """Частичное обновление флагов модулей. Передаваемые ключи переопределяют
    текущие значения; неупомянутые остаются как есть. Полезно для ручной
    докрутки после применения шаблона."""
    org = await _get_org_or_404(db, org_id)
    settings = dict(org.business_settings or {})
    current_modules = dict(settings.get("modules", {}))
    current_modules.update(payload.modules)
    settings["modules"] = current_modules
    org.business_settings = settings
    await db.commit()
    return await get_org(org_id, db)


def _compute_status(org: Organization, today: date) -> tuple[str, int | None]:
    """Возвращает (статус, days_left). Статусы: active / blocked / no_payment_set."""
    if org.paid_until is None:
        return "no_payment_set", None
    days_left = (org.paid_until - today).days
    if days_left < 0 or not org.is_active:
        return "blocked", days_left
    return "active", days_left


async def _generate_org_code(db: AsyncSession) -> str:
    while True:
        code = f"{''.join(random.choices(string.ascii_uppercase, k=3))}{''.join(random.choices(string.digits, k=3))}"
        existing = (
            await db.execute(select(Organization).where(Organization.org_code == code))
        ).scalar_one_or_none()
        if not existing:
            return code


_CYRILLIC_MAP = str.maketrans({
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo",
    "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
})


def _slug_from_name(name: str) -> str:
    """Транслитерация кириллицы в латиницу + чистка под pattern [a-z0-9-]."""
    s = name.lower().translate(_CYRILLIC_MAP)
    out = []
    for ch in s:
        if ch.isascii() and (ch.isalnum() or ch == "-"):
            out.append(ch)
        else:
            out.append("-")
    cleaned = "".join(out).strip("-")
    while "--" in cleaned:
        cleaned = cleaned.replace("--", "-")
    return cleaned[:80]


async def _resolve_slug(db: AsyncSession, requested: str | None, name: str) -> str:
    """Если slug не задан / невалиден — генерим из имени. Если занят — добавляем суффикс."""
    valid_pattern = re.compile(r"^[a-z0-9-]+$")
    candidate = (requested or "").strip().lower()
    if not candidate or not valid_pattern.fullmatch(candidate):
        candidate = _slug_from_name(name)
    if not candidate:
        candidate = "shop"
    base = candidate
    suffix = 0
    while True:
        existing = (
            await db.execute(select(Organization).where(Organization.slug == candidate))
        ).scalar_one_or_none()
        if not existing:
            return candidate
        suffix += 1
        candidate = f"{base}-{suffix}"[:100]


@router.get("/stats", response_model=DashboardStats)
async def dashboard_stats(db: AsyncSession = Depends(get_db)) -> DashboardStats:
    today = date.today()
    soon = today + timedelta(days=7)

    orgs = list(
        (await db.execute(select(Organization).where(Organization.is_deleted.is_(False)))).scalars().all()
    )
    total = len(orgs)
    blocked = 0
    no_payment = 0
    active = 0
    revenue = 0
    expiring_soon = 0
    for o in orgs:
        status, _ = _compute_status(o, today)
        if status == "blocked":
            blocked += 1
        elif status == "no_payment_set":
            no_payment += 1
        else:
            active += 1
            if o.monthly_fee:
                revenue += o.monthly_fee
            if o.paid_until and today <= o.paid_until <= soon:
                expiring_soon += 1
    return DashboardStats(
        total_orgs=total,
        active_orgs=active,
        blocked_orgs=blocked,
        no_payment_set=no_payment,
        monthly_revenue=revenue,
        expiring_soon=expiring_soon,
    )


@router.get("/orgs", response_model=list[OrgListItem])
async def list_orgs(db: AsyncSession = Depends(get_db)) -> list[OrgListItem]:
    today = date.today()
    orgs = list(
        (
            await db.execute(
                select(Organization)
                .where(Organization.is_deleted.is_(False))
                .order_by(Organization.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    counts_rows = (
        await db.execute(
            select(User.org_id, func.count(User.id))
            .where(User.is_deleted.is_(False))
            .group_by(User.org_id)
        )
    ).all()
    counts: dict[int, int] = {row[0]: row[1] for row in counts_rows}

    result: list[OrgListItem] = []
    for o in orgs:
        status, days_left = _compute_status(o, today)
        result.append(
            OrgListItem(
                id=o.id,
                name=o.name,
                org_code=o.org_code,
                slug=o.slug,
                plan=o.plan.value,
                is_active=o.is_active,
                monthly_fee=o.monthly_fee,
                paid_until=o.paid_until,
                category=o.category,
                employees_count=counts.get(o.id, 0),
                status=status,
                days_left=days_left,
                created_at=o.created_at,
                weighed=_weighed_config(o),
            )
        )
    return result


@router.post("/orgs", response_model=OrgListItem, status_code=201)
async def create_org(payload: OrgCreateRequest, db: AsyncSession = Depends(get_db)) -> OrgListItem:
    slug = await _resolve_slug(db, payload.slug, payload.name)
    existing_phone = (
        await db.execute(select(User).where(User.phone == payload.owner_phone, User.is_deleted.is_(False)))
    ).scalar_one_or_none()
    if existing_phone:
        raise HTTPException(status_code=409, detail="Пользователь с таким телефоном уже существует")

    org = Organization(
        name=payload.name,
        slug=slug,
        org_code=await _generate_org_code(db),
        plan=OrganizationPlan.start,
        is_active=True,
        monthly_fee=payload.monthly_fee,
        paid_until=payload.paid_until,
        category=_validate_category(payload.category),
    )
    db.add(org)
    await db.flush()

    owner = User(
        org_id=org.id,
        name=payload.owner_name,
        phone=payload.owner_phone,
        password_hash=get_password_hash(payload.owner_password),
        role=UserRole.owner,
        pin_code=get_password_hash(payload.owner_pin),
        report_pin=get_password_hash(payload.owner_report_pin),
        qr_secret="".join(random.choices(string.ascii_letters + string.digits, k=32)),
        qr_expires_at=datetime.now(timezone.utc) + timedelta(days=30),
    )
    db.add(owner)
    await db.flush()
    org.owner_id = owner.id
    await db.commit()
    await db.refresh(org)

    # Push супер-админам о новом магазине.
    try:
        import asyncio
        from app.services.push_service import send_super_push
        asyncio.create_task(send_super_push(
            title="🆕 Новый магазин",
            body=f"{org.name} (код {org.org_code})",
            url=f"/super/orgs/{org.id}",
        ))
    except Exception:
        pass  # push не критично, не валим создание орг

    today = date.today()
    status, days_left = _compute_status(org, today)
    return OrgListItem(
        id=org.id,
        name=org.name,
        org_code=org.org_code,
        slug=org.slug,
        plan=org.plan.value,
        is_active=org.is_active,
        monthly_fee=org.monthly_fee,
        paid_until=org.paid_until,
        category=org.category,
        employees_count=1,
        status=status,
        days_left=days_left,
        created_at=org.created_at,
        weighed=_weighed_config(org),
    )


async def _get_org_or_404(db: AsyncSession, org_id: int) -> Organization:
    org = (
        await db.execute(
            select(Organization).where(Organization.id == org_id, Organization.is_deleted.is_(False))
        )
    ).scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Магазин не найден")
    return org


@router.get("/orgs/{org_id}", response_model=OrgDetails)
async def get_org(org_id: int, db: AsyncSession = Depends(get_db)) -> OrgDetails:
    org = await _get_org_or_404(db, org_id)
    today = date.today()
    status, days_left = _compute_status(org, today)

    users = list(
        (
            await db.execute(
                select(User)
                .where(User.org_id == org.id, User.is_deleted.is_(False))
                .order_by(User.role.asc(), User.id.asc())
            )
        )
        .scalars()
        .all()
    )
    payments = list(
        (
            await db.execute(
                select(Payment).where(Payment.org_id == org.id).order_by(Payment.paid_at.desc())
            )
        )
        .scalars()
        .all()
    )
    # Использование скан-квоты за текущий месяц.
    from datetime import datetime as _dt, timezone as _tz
    from app.models.invoice_scan_usage import InvoiceScanUsage as _Usage
    _ym = _dt.now(_tz.utc).strftime("%Y-%m")
    _usage_row = (
        await db.execute(
            select(_Usage).where(_Usage.org_id == org.id, _Usage.year_month == _ym)
        )
    ).scalar_one_or_none()
    invoice_scan_used = _usage_row.count if _usage_row else 0

    settings = org.business_settings or {}
    return OrgDetails(
        id=org.id,
        name=org.name,
        org_code=org.org_code,
        slug=org.slug,
        plan=org.plan.value,
        is_active=org.is_active,
        monthly_fee=org.monthly_fee,
        paid_until=org.paid_until,
        category=org.category,
        status=status,
        days_left=days_left,
        created_at=org.created_at,
        weighed=_weighed_config(org),
        business_type=org.business_type,
        business_modules=dict(settings.get("modules", {})),
        business_units=list(settings.get("units", [])),
        has_invoice_scan=bool(org.has_invoice_scan),
        invoice_scan_quota=int(org.invoice_scan_quota or 200),
        invoice_scan_used=invoice_scan_used,
        employees=[
            OrgEmployee(
                id=u.id,
                name=u.name,
                phone=u.phone,
                role=u.role.value,
                has_pin=bool(u.pin_code),
            )
            for u in users
        ],
        payments=[
            PaymentItem(
                id=p.id,
                amount=p.amount,
                period_until=p.period_until,
                paid_at=p.paid_at,
                note=p.note,
            )
            for p in payments
        ],
    )


@router.patch("/orgs/{org_id}", response_model=OrgDetails)
async def update_org(
    org_id: int, payload: OrgUpdateRequest, db: AsyncSession = Depends(get_db)
) -> OrgDetails:
    org = await _get_org_or_404(db, org_id)
    updates = payload.model_dump(exclude_unset=True)
    if "category" in updates:
        updates["category"] = _validate_category(updates["category"])
    for field, value in updates.items():
        setattr(org, field, value)
    _validate_weighed_format(org)
    await db.commit()
    return await get_org(org_id, db)


@router.delete("/orgs/{org_id}", status_code=204)
async def delete_org(org_id: int, db: AsyncSession = Depends(get_db)) -> None:
    """Soft-delete магазина. Помечает is_deleted=True и is_active=False.
    Данные (товары, продажи, кассиры) остаются в БД — можно восстановить
    через прямой UPDATE если потребуется."""
    org = await _get_org_or_404(db, org_id)
    org.is_deleted = True
    org.is_active = False
    await db.commit()


@router.post("/orgs/{org_id}/users", response_model=OrgEmployee, status_code=201)
async def add_employee(
    org_id: int, payload: OrgEmployeeCreate, db: AsyncSession = Depends(get_db)
) -> OrgEmployee:
    await _get_org_or_404(db, org_id)
    existing_phone = (
        await db.execute(select(User).where(User.phone == payload.phone, User.is_deleted.is_(False)))
    ).scalar_one_or_none()
    if existing_phone:
        raise HTTPException(status_code=409, detail="Пользователь с таким телефоном уже существует")

    user = User(
        org_id=org_id,
        name=payload.name,
        phone=payload.phone,
        password_hash=get_password_hash(payload.password),
        role=UserRole(payload.role),
        pin_code=get_password_hash(payload.pin_code),
        qr_secret="".join(random.choices(string.ascii_letters + string.digits, k=32)),
        qr_expires_at=datetime.now(timezone.utc) + timedelta(days=30),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return OrgEmployee(id=user.id, name=user.name, phone=user.phone, role=user.role.value, has_pin=True)


@router.patch("/orgs/{org_id}/users/{user_id}", response_model=OrgEmployee)
async def update_employee(
    org_id: int, user_id: int, payload: OrgEmployeeUpdate, db: AsyncSession = Depends(get_db)
) -> OrgEmployee:
    user = (
        await db.execute(
            select(User).where(User.id == user_id, User.org_id == org_id, User.is_deleted.is_(False))
        )
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    if payload.name is not None:
        user.name = payload.name
    if payload.role is not None:
        user.role = UserRole(payload.role)
    if payload.pin_code is not None:
        user.pin_code = get_password_hash(payload.pin_code)
        user.failed_pin_attempts = 0
        user.pin_locked_until = None
    await db.commit()
    await db.refresh(user)
    return OrgEmployee(
        id=user.id, name=user.name, phone=user.phone, role=user.role.value, has_pin=bool(user.pin_code)
    )


@router.delete("/orgs/{org_id}/users/{user_id}", status_code=204)
async def delete_employee(org_id: int, user_id: int, db: AsyncSession = Depends(get_db)) -> None:
    user = (
        await db.execute(
            select(User).where(User.id == user_id, User.org_id == org_id, User.is_deleted.is_(False))
        )
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    user.is_deleted = True
    user.deleted_at = datetime.now(timezone.utc)
    await db.commit()


@router.post("/orgs/{org_id}/import", response_model=ImportResult)
async def import_products(
    org_id: int,
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
) -> ImportResult:
    """Импорт каталога из Umag .xlsx в магазин. UPSERT по (org_id, barcode):
    существующий товар обновляется, новый создаётся. Кол-во заводится как
    StockMovement type=in_stock. Если штрихкод занят в ДРУГОМ магазине —
    строка пропускается (это глобальное ограничение схемы Product.barcode unique)."""
    await _get_org_or_404(db, org_id)

    if not file.filename or not file.filename.lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Ожидается файл .xlsx (Umag-экспорт)")

    try:
        rows, parse_errors = parse_umag_xlsx(file.file)
    except Exception as exc:  # openpyxl кидает разные типы при битом файле
        raise HTTPException(status_code=400, detail=f"Не удалось прочитать файл: {exc}")

    errors: list[ImportErrorItem] = [ImportErrorItem(row=e.row_index, reason=e.reason) for e in parse_errors]
    created = 0
    updated = 0
    skipped = 0

    for row in rows:
        # Сначала ищем в текущем магазине
        existing = (
            await db.execute(
                select(Product).where(
                    Product.org_id == org_id,
                    Product.barcode == row.barcode,
                    Product.is_deleted.is_(False),
                )
            )
        ).scalar_one_or_none()

        if existing:
            existing.name = row.name
            existing.category = row.category
            existing.sale_price = row.sale_price
            existing.purchase_price = row.purchase_price
            await db.flush()
            if row.quantity > 0:
                db.add(
                    StockMovement(
                        org_id=org_id,
                        product_id=existing.id,
                        quantity=row.quantity,
                        type=StockMovementType.in_stock,
                        reason=f"Импорт каталога ({file.filename})",
                    )
                )
            updated += 1
            continue

        # Нет в этом магазине — проверяем глобальную занятость штрихкода
        conflict = (
            await db.execute(
                select(Product.org_id).where(Product.barcode == row.barcode, Product.is_deleted.is_(False))
            )
        ).scalar_one_or_none()
        if conflict is not None:
            errors.append(
                ImportErrorItem(
                    row=row.row_index,
                    reason=f"штрихкод {row.barcode} уже используется в другом магазине (org_id={conflict})",
                )
            )
            skipped += 1
            continue

        product = Product(
            org_id=org_id,
            name=row.name,
            category=row.category,
            barcode=row.barcode,
            barcode_generated=False,
            purchase_price=row.purchase_price,
            sale_price=row.sale_price,
        )
        db.add(product)
        await db.flush()
        if row.quantity > 0:
            db.add(
                StockMovement(
                    org_id=org_id,
                    product_id=product.id,
                    quantity=row.quantity,
                    type=StockMovementType.in_stock,
                    reason=f"Импорт каталога ({file.filename})",
                )
            )
        created += 1

    await db.commit()
    return ImportResult(created=created, updated=updated, skipped=skipped, errors=errors)


@router.post("/orgs/{org_id}/payments", response_model=PaymentItem, status_code=201)
async def add_payment(
    org_id: int,
    payload: PaymentCreate,
    db: AsyncSession = Depends(get_db),
    admin: PlatformAdmin = Depends(get_current_platform_admin),
) -> PaymentItem:
    org = await _get_org_or_404(db, org_id)
    paid_at = payload.paid_at or date.today()
    payment = Payment(
        org_id=org.id,
        amount=payload.amount,
        period_until=payload.period_until,
        paid_at=paid_at,
        note=payload.note,
        created_by_admin_id=admin.id,
    )
    db.add(payment)

    # Сдвигаем paid_until организации до максимальной из новых и старых дат.
    # Если payload.period_until > текущего org.paid_until — значит подписка
    # продлевается. Если меньше (например, бэк-дейт корректировки) — не трогаем.
    if not org.paid_until or payload.period_until > org.paid_until:
        org.paid_until = payload.period_until

    await db.commit()
    await db.refresh(payment)
    return PaymentItem(
        id=payment.id,
        amount=payment.amount,
        period_until=payment.period_until,
        paid_at=payment.paid_at,
        note=payment.note,
    )
