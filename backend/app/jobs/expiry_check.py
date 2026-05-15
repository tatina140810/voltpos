"""Cron-джоб: проверка сроков годности и push-алерты владельцам.

Запуск:
    /opt/voltpos/backend/venv/bin/python -m app.jobs.expiry_check

Логика:
1. Для каждой активной Organization:
   - Если business_type не NULL и в business_settings.modules.expiry_date != true → пропускаем.
     (Огонёк с business_type=NULL получает алерты по умолчанию — так задумано.)
2. Берём все активные Product этой организации с min_days_before_expiry > 0.
3. Считаем min(expiry_date) по приходам каждого товара (как в /api/stock).
4. Если min_expiry_date − today ≤ product.min_days_before_expiry → товар попадает в алерт.
5. Шлём один сводный push на организацию (один на все позиции).
"""
from __future__ import annotations

import asyncio
import logging
from datetime import date, timedelta
from typing import Any

from sqlalchemy import and_, case, func, select

from app.database import SessionLocal
from app.models.organization import Organization
from app.models.product import Product
from app.models.stock import StockMovement, StockMovementType
from app.services.push_service import build_payload, send_push_to_org_owners


logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(name)s | %(message)s")
log = logging.getLogger("expiry_check")


def _module_enabled(org: Organization, key: str) -> bool:
    """Огонёк (business_type=NULL) — все модули вкл по умолчанию.
    Иначе берём из business_settings.modules.<key> (default False)."""
    if org.business_type is None:
        return True
    settings = org.business_settings or {}
    modules = settings.get("modules") or {}
    return bool(modules.get(key, False))


async def find_expiring_for_org(db, org_id: int, today: date) -> list[dict[str, Any]]:
    """Возвращает товары которые попадают под алерт для организации."""
    min_expiry = func.min(
        case((StockMovement.type == StockMovementType.in_stock, StockMovement.expiry_date))
    )
    in_sum = func.coalesce(
        func.sum(case((StockMovement.type == StockMovementType.in_stock, StockMovement.quantity), else_=0)), 0
    )
    # out + writeoff (списание) — оба уменьшают остаток.
    out_sum = func.coalesce(
        func.sum(case(
            (StockMovement.type.in_([StockMovementType.out, StockMovementType.writeoff]), StockMovement.quantity),
            else_=0,
        )), 0
    )
    stmt = (
        select(
            Product.id,
            Product.name,
            Product.min_days_before_expiry,
            min_expiry.label("min_expiry"),
            in_sum.label("in_qty"),
            out_sum.label("out_qty"),
        )
        .outerjoin(
            StockMovement,
            and_(Product.id == StockMovement.product_id, StockMovement.is_deleted.is_(False)),
        )
        .where(
            Product.org_id == org_id,
            Product.is_deleted.is_(False),
            Product.min_days_before_expiry > 0,
        )
        .group_by(Product.id)
    )
    rows = (await db.execute(stmt)).all()

    out: list[dict[str, Any]] = []
    for r in rows:
        if r.min_expiry is None:
            continue
        balance = int(r.in_qty or 0) - int(r.out_qty or 0)
        if balance <= 0:
            continue  # уже распродан, не алертим
        days_left = (r.min_expiry - today).days
        threshold = int(r.min_days_before_expiry or 0)
        if days_left > threshold:
            continue
        out.append({
            "product_id": r.id,
            "name": r.name,
            "expiry_date": r.min_expiry,
            "expiry_label": r.min_expiry.strftime("%d.%m.%Y"),
            "days": days_left,
            "balance": balance,
        })
    out.sort(key=lambda it: it["days"])
    return out


async def run() -> int:
    today = date.today()
    notified_orgs = 0
    total_items = 0

    async with SessionLocal() as db:
        orgs_res = await db.execute(
            select(Organization).where(
                Organization.is_active.is_(True),
                Organization.is_deleted.is_(False),
            )
        )
        orgs = list(orgs_res.scalars().all())

        for org in orgs:
            if not _module_enabled(org, "expiry_date"):
                log.info("org=%s (%s): expiry_date module disabled, skip", org.id, org.name)
                continue
            items = await find_expiring_for_org(db, org.id, today)
            if not items:
                log.info("org=%s (%s): nothing to alert", org.id, org.name)
                continue

            payload = build_payload("expiry_alert", {
                "items": items,
                "count_label": f"{len(items)} товар(ов) скоро истекают",
            })
            await send_push_to_org_owners(org.id, payload)
            notified_orgs += 1
            total_items += len(items)
            log.info("org=%s (%s): pushed alert with %d items", org.id, org.name, len(items))

    log.info("done: notified_orgs=%d total_items=%d", notified_orgs, total_items)
    return 0


if __name__ == "__main__":
    asyncio.run(run())
