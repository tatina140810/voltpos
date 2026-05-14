from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models.push_subscription import PushSubscription
from app.models.user import User, UserRole
from app.schemas.push import PushSubscribePayload

router = APIRouter(prefix="/push", tags=["push"])


@router.get("/vapid-public-key")
async def get_vapid_key() -> dict[str, str | None]:
    return {"publicKey": settings.vapid_public_key}


@router.post("/subscribe")
async def subscribe(
    payload: PushSubscribePayload,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, str]:
    """Сохранить push-подписку владельца. Только роль owner — у других ролей нет UI кнопки.
    Идемпотентно: если endpoint уже есть в БД (тот же браузер), переписываем ключи."""
    if user.role != UserRole.owner:
        raise HTTPException(status_code=403, detail="Push доступен только для владельцев")

    existing = (
        await db.execute(select(PushSubscription).where(PushSubscription.endpoint == payload.endpoint))
    ).scalar_one_or_none()

    if existing:
        existing.org_id = user.org_id
        existing.user_id = user.id
        existing.p256dh = payload.keys.p256dh
        existing.auth = payload.keys.auth
        existing.user_agent = payload.user_agent
    else:
        db.add(
            PushSubscription(
                org_id=user.org_id,
                user_id=user.id,
                endpoint=payload.endpoint,
                p256dh=payload.keys.p256dh,
                auth=payload.keys.auth,
                user_agent=payload.user_agent,
            )
        )
    await db.commit()
    return {"status": "ok"}


@router.post("/unsubscribe")
async def unsubscribe(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, str]:
    """Удалить подписку для конкретного endpoint (используется при выключении уведомлений в UI)."""
    endpoint = payload.get("endpoint") if isinstance(payload, dict) else None
    if endpoint:
        await db.execute(
            delete(PushSubscription).where(
                PushSubscription.endpoint == endpoint,
                PushSubscription.user_id == user.id,
            )
        )
    else:
        await db.execute(delete(PushSubscription).where(PushSubscription.user_id == user.id))
    await db.commit()
    return {"status": "ok"}


@router.get("/status")
async def status(
    endpoint: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, bool]:
    """Проверка: подписан ли текущий браузер. Фронт сверяет endpoint своего PushSubscription
    с тем, что в БД — на случай если подписка была отозвана с другого устройства."""
    if not endpoint:
        return {"subscribed": False}
    row = (
        await db.execute(
            select(PushSubscription.id).where(
                PushSubscription.endpoint == endpoint,
                PushSubscription.user_id == user.id,
            )
        )
    ).first()
    return {"subscribed": row is not None}
