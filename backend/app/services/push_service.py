from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from pywebpush import WebPushException, webpush
from sqlalchemy import delete, select

from app.config import settings
from app.database import SessionLocal
from app.models.push_subscription import PushSubscription
from app.models.user import User, UserRole

logger = logging.getLogger(__name__)


def build_payload(event_type: str, data: dict[str, Any]) -> dict[str, Any]:
    """Сообщение для push: title + body + параметры отображения.
    Эмодзи в title — единственный «иконочный» элемент, надёжный кросс-платформенно."""

    icons = {"sale": "🛒", "return": "↩️", "writeoff": "📦", "cashout": "💵", "expiry_alert": "⏰", "debt_alert": "📞"}
    titles = {
        "sale": "Новая продажа",
        "return": "Возврат товара",
        "writeoff": "Списание товара",
        "cashout": "Инкассация",
        "expiry_alert": "Скоро истекает срок",
        "debt_alert": "Долги: позвонить",
    }

    icon = icons.get(event_type, "🔔")
    title = titles.get(event_type, "Событие")

    if event_type == "sale":
        body = (
            f"Продавец: {data['seller_name']}\n"
            f"Сумма: {_money(data['total'])} сом\n"
            f"Оплата: {data['payment_type']}"
        )
        url = "/reports"
    elif event_type == "return":
        body = (
            f"Продавец: {data['seller_name']}\n"
            f"Товар: {data['product_name']}\n"
            f"Сумма возврата: {_money(data['amount'])} сом"
        )
        url = "/stock"
    elif event_type == "writeoff":
        body = (
            f"Продавец: {data['seller_name']}\n"
            f"Товар: {data['product_name']}\n"
            f"Причина: {data['reason']}"
        )
        url = "/stock"
    elif event_type == "cashout":
        body = (
            f"Кто: {data['seller_name']}\n"
            f"Сумма: {_money(data['amount'])} сом\n"
            f"Причина: {data['reason']}"
        )
        url = "/cash-withdrawals"
    elif event_type == "expiry_alert":
        items = data.get("items") or []
        head = data.get("count_label") or f"{len(items)} товар(ов) скоро истекают"
        lines = [f"• {it['name']} — до {it['expiry_label']} ({it['days']} дн.)" for it in items[:5]]
        body = head + "\n" + "\n".join(lines)
        if len(items) > 5:
            body += f"\nИ ещё {len(items) - 5} позиций"
        url = "/stock?expiring=1"
    elif event_type == "debt_alert":
        items = data.get("items") or []
        head = data.get("count_label") or f"{len(items)} клиент(ов) с долгами"
        # Формат строки: «• Иван Иванов — 1500 сом — обещал сегодня — +996...»
        lines = []
        for it in items[:5]:
            tag = it.get("tag", "")
            phone = it.get("phone") or ""
            phone_part = f" — {phone}" if phone else ""
            lines.append(f"• {it['name']} — {_money(it['amount'])} сом — {tag}{phone_part}")
        body = head + "\n" + "\n".join(lines)
        if len(items) > 5:
            body += f"\nИ ещё {len(items) - 5} клиентов"
        url = "/customers?debtors=1"
    else:
        body = ""
        url = "/"

    return {
        "title": f"{icon} {title}",
        "body": body,
        "icon": "/logo.png",
        "badge": "/logo.png",
        "tag": event_type,
        "vibrate": [200, 100, 200],
        "url": url,
    }


def _money(value: Any) -> str:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return str(value)
    if n.is_integer():
        return f"{int(n):,}".replace(",", " ")
    return f"{n:,.2f}".replace(",", " ")


def _send_one(endpoint: str, p256dh: str, auth: str, payload: dict[str, Any]) -> None:
    """Синхронная отправка одного push (pywebpush блокирует на сетевом запросе).
    Запускаем в threadpool через asyncio.to_thread, чтобы не блокировать event loop."""
    webpush(
        subscription_info={"endpoint": endpoint, "keys": {"p256dh": p256dh, "auth": auth}},
        data=json.dumps(payload, ensure_ascii=False),
        vapid_private_key=settings.vapid_private_key,
        vapid_claims={"sub": settings.vapid_subject},
    )


async def send_push_to_org_owners(org_id: int, payload: dict[str, Any]) -> None:
    """Отправляет push всем активным подпискам владельцев данной организации.
    Безопасно вызывать из BackgroundTasks — открывает свою сессию БД, не зависит от
    сессии роутера. Если VAPID-ключи не настроены — молча выходит."""

    if not settings.vapid_private_key or not settings.vapid_public_key:
        logger.warning("VAPID keys not configured, skipping push for org %s", org_id)
        return

    async with SessionLocal() as db:
        result = await db.execute(
            select(PushSubscription)
            .join(User, User.id == PushSubscription.user_id)
            .where(
                PushSubscription.org_id == org_id,
                User.role == UserRole.owner,
                User.is_deleted.is_(False),
            )
        )
        subs = list(result.scalars().all())
        if not subs:
            return

        dead: list[str] = []
        for sub in subs:
            try:
                await asyncio.to_thread(_send_one, sub.endpoint, sub.p256dh, sub.auth, payload)
            except WebPushException as exc:
                # 404/410 — подписка отозвана пользователем или истекла. Чистим из БД.
                status_code = getattr(getattr(exc, "response", None), "status_code", None)
                if status_code in (404, 410):
                    dead.append(sub.endpoint)
                else:
                    logger.warning("Push failed for endpoint %s: %s", sub.endpoint[:60], exc)
            except Exception as exc:  # сеть упала, DNS и т.п. — не убиваем фон-таск
                logger.warning("Push transport error: %s", exc)

        if dead:
            await db.execute(delete(PushSubscription).where(PushSubscription.endpoint.in_(dead)))
            await db.commit()
