"""Web push для супер-админа платформы.
Использует те же VAPID ключи, что и кассирские push (settings.vapid_*)."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_platform_admin
from app.models.platform_admin import PlatformAdmin
from app.models.super_push_subscription import SuperPushSubscription
from app.services.push_service import send_super_push

router = APIRouter(prefix="/super/push", tags=["super_push"])


class SubscriptionIn(BaseModel):
    endpoint: str
    p256dh: str
    auth: str


class PushSendIn(BaseModel):
    title: str
    body: str
    url: str | None = "/super/orgs"


@router.get("/vapid-key")
async def get_vapid_key() -> dict:
    """Публичный VAPID-ключ для подписки. Доступ без аутентификации —
    ключ нужен ещё ДО регистрации SubscribeOptions в браузере."""
    return {"public_key": settings.vapid_public_key or ""}


@router.get("/status")
async def get_subscription_status(
    db: AsyncSession = Depends(get_db),
    admin: PlatformAdmin = Depends(get_current_platform_admin),
) -> dict:
    """Статус подписки текущего супер-админа."""
    count = (
        await db.execute(
            select(SuperPushSubscription).where(SuperPushSubscription.platform_admin_id == admin.id)
        )
    ).scalars().all()
    return {"subscribed": len(count) > 0, "device_count": len(count)}


@router.post("/subscribe")
async def subscribe(
    payload: SubscriptionIn,
    db: AsyncSession = Depends(get_db),
    admin: PlatformAdmin = Depends(get_current_platform_admin),
) -> dict:
    """Сохраняет push-подписку устройства. Если такой endpoint уже есть — обновляет ключи
    (это бывает когда юзер заново подписался на том же браузере)."""
    existing = (
        await db.execute(
            select(SuperPushSubscription).where(SuperPushSubscription.endpoint == payload.endpoint)
        )
    ).scalar_one_or_none()
    if existing:
        existing.p256dh = payload.p256dh
        existing.auth = payload.auth
        existing.platform_admin_id = admin.id
    else:
        db.add(SuperPushSubscription(
            platform_admin_id=admin.id,
            endpoint=payload.endpoint,
            p256dh=payload.p256dh,
            auth=payload.auth,
            created_at=datetime.now(timezone.utc),
        ))
    await db.commit()
    return {"detail": "Подписка сохранена"}


@router.delete("/unsubscribe")
async def unsubscribe(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    admin: PlatformAdmin = Depends(get_current_platform_admin),
) -> dict:
    """Удаляет подписку по endpoint."""
    endpoint = payload.get("endpoint") if isinstance(payload, dict) else None
    if not endpoint:
        raise HTTPException(status_code=400, detail="endpoint обязателен")
    await db.execute(
        delete(SuperPushSubscription).where(
            SuperPushSubscription.endpoint == endpoint,
            SuperPushSubscription.platform_admin_id == admin.id,
        )
    )
    await db.commit()
    return {"detail": "Подписка удалена"}


@router.post("/send")
async def send_test(
    payload: PushSendIn,
    admin: PlatformAdmin = Depends(get_current_platform_admin),
) -> dict:
    """Тестовая отправка push всем супер-админам. Доступно только супер-админам."""
    await send_super_push(payload.title, payload.body, payload.url or "/super/orgs")
    return {"detail": "Push отправлен"}
