"""Cron-джоб: ежедневное напоминание владельцу о долгах клиентов.

Запуск:
    /opt/voltpos/backend/venv/bin/python -m app.jobs.debt_check

Логика по каждой Organization:
1. Берём все Sale.status == debt с непокрытым остатком (total - paid > 0).
2. Для каждой такой продажи определяем «тег»:
   - "обещал сегодня" — promised_payment_date == today
   - "просрочено N дн." — promised_payment_date < today
   - "висит N дней" — promised_payment_date IS NULL И created_at старше OLD_DEBT_THRESHOLD_DAYS
3. Группируем по customer (один клиент может иметь несколько долговых продаж — берём
   самый «срочный» тег и суммируем оставшиеся долги).
4. Если есть кому звонить — отправляем один сводный push владельцу.
"""
from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import select

from app.database import SessionLocal
from app.models.customer import Customer
from app.models.organization import Organization
from app.models.sale import Sale, SaleStatus
from app.services.push_service import build_payload, send_push_to_org_owners


logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(name)s | %(message)s")
log = logging.getLogger("debt_check")

# Порог «давно висящего» долга без обещания.
OLD_DEBT_THRESHOLD_DAYS = 30

# Приоритет тегов: чем меньше — тем важнее (попадает первым в push).
TAG_PRIORITY = {"overdue": 0, "today": 1, "old": 2}


def _zero() -> Decimal:
    return Decimal("0.00")


def _paid(s: Sale) -> Decimal:
    return (s.paid_cash or _zero()) + (s.paid_card or _zero()) + (s.paid_transfer or _zero())


def _classify(s: Sale, today: date) -> tuple[str, str] | None:
    """Возвращает (tag_key, tag_label) или None если на этот долг алертить не нужно."""
    if s.promised_payment_date is not None:
        if s.promised_payment_date == today:
            return "today", "обещал сегодня"
        if s.promised_payment_date < today:
            days = (today - s.promised_payment_date).days
            return "overdue", f"просрочено {days} дн."
        return None  # обещанная дата ещё в будущем — не беспокоим
    # Нет обещания. Алертим только если давно висит.
    if s.created_at is None:
        return None
    # created_at в БД может прийти naive (старые записи) — приведём к aware UTC.
    created = s.created_at if s.created_at.tzinfo else s.created_at.replace(tzinfo=timezone.utc)
    age = (datetime.now(timezone.utc) - created).days
    if age >= OLD_DEBT_THRESHOLD_DAYS:
        return "old", f"висит {age} дн."
    return None


async def find_debt_alerts_for_org(db, org_id: int, today: date) -> list[dict[str, Any]]:
    """Список клиентов-должников для этой организации."""
    debt_sales = list(
        (
            await db.execute(
                select(Sale).where(
                    Sale.org_id == org_id,
                    Sale.status == SaleStatus.debt,
                    Sale.is_deleted.is_(False),
                )
            )
        ).scalars().all()
    )

    # customer_id -> {"amount": Decimal, "best_tag": (priority, label), "sale_ids": [...]}
    by_customer: dict[int, dict[str, Any]] = defaultdict(
        lambda: {"amount": _zero(), "best_tag": None, "sale_ids": []}
    )
    for s in debt_sales:
        remaining = (s.total or _zero()) - _paid(s)
        if remaining <= 0:
            continue
        if not s.customer_id:
            continue
        tag = _classify(s, today)
        if tag is None:
            continue
        tag_key, tag_label = tag
        agg = by_customer[s.customer_id]
        agg["amount"] += remaining
        agg["sale_ids"].append(s.id)
        prio = TAG_PRIORITY.get(tag_key, 99)
        if agg["best_tag"] is None or prio < agg["best_tag"][0]:
            agg["best_tag"] = (prio, tag_label)

    if not by_customer:
        return []

    customer_ids = list(by_customer.keys())
    customers = (
        await db.execute(select(Customer).where(Customer.id.in_(customer_ids)))
    ).scalars().all()
    cust_map = {c.id: c for c in customers}

    items = []
    for cid, agg in by_customer.items():
        c = cust_map.get(cid)
        if not c:
            continue
        items.append({
            "customer_id": cid,
            "name": c.name,
            "phone": c.phone,
            "amount": float(agg["amount"]),
            "tag": agg["best_tag"][1] if agg["best_tag"] else "",
            "_priority": agg["best_tag"][0] if agg["best_tag"] else 99,
        })
    items.sort(key=lambda it: (it["_priority"], -it["amount"]))
    for it in items:
        it.pop("_priority", None)
    return items


async def run() -> int:
    today = date.today()
    notified = 0
    total = 0

    async with SessionLocal() as db:
        orgs = list(
            (
                await db.execute(
                    select(Organization).where(
                        Organization.is_active.is_(True),
                        Organization.is_deleted.is_(False),
                    )
                )
            ).scalars().all()
        )
        for org in orgs:
            items = await find_debt_alerts_for_org(db, org.id, today)
            if not items:
                log.info("org=%s (%s): no debt alerts", org.id, org.name)
                continue
            payload = build_payload("debt_alert", {
                "items": items,
                "count_label": f"{len(items)} клиент(ов) — нужен звонок",
            })
            await send_push_to_org_owners(org.id, payload)
            notified += 1
            total += len(items)
            log.info("org=%s (%s): pushed debt alert with %d clients", org.id, org.name, len(items))

    log.info("done: notified_orgs=%d total_clients=%d", notified, total)
    return 0


if __name__ == "__main__":
    asyncio.run(run())
