import random
import string
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models.organization import Organization
from app.models.user import User, UserRole
from app.schemas.organization import OrganizationOut, OrganizationUpdate, OrgUserCreate, OrgUserUpdate
from app.utils.security import get_password_hash

router = APIRouter(prefix="/org", tags=["organization"])


@router.get("/me", response_model=OrganizationOut)
async def my_org(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> Organization:
    org = (await db.execute(select(Organization).where(Organization.id == current_user.org_id))).scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Организация не найдена")
    return org


@router.put("/me", response_model=OrganizationOut)
async def update_org(
    payload: OrganizationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("owner")),
) -> Organization:
    org = (await db.execute(select(Organization).where(Organization.id == current_user.org_id))).scalar_one()
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(org, field, value)
    await db.commit()
    await db.refresh(org)
    return org


@router.get("/me/users")
async def list_users(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[dict]:
    users = list(
        (
            await db.execute(select(User).where(User.org_id == current_user.org_id, User.is_deleted.is_(False)).order_by(User.id))
        ).scalars()
    )
    return [
        {
            "id": u.id,
            "name": u.name,
            "phone": u.phone,
            "role": u.role.value,
            "menu_overrides": u.menu_overrides,
        }
        for u in users
    ]


@router.put("/users/{user_id}/menu")
async def update_user_menu_overrides(
    user_id: int,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("owner")),
) -> dict:
    """Сохранить переопределения доступа к разделам меню для одного сотрудника.
    Тело запроса: {"menu_overrides": {"/stock": true, "/customers": false} | null}.
    Только owner. Сами защиты на бэкенде нет (UI-only) — это требование пользователя."""
    user = (
        await db.execute(
            select(User).where(
                User.id == user_id,
                User.org_id == current_user.org_id,
                User.is_deleted.is_(False),
            )
        )
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Нельзя редактировать собственный доступ")
    overrides = payload.get("menu_overrides")
    if overrides is not None and not isinstance(overrides, dict):
        raise HTTPException(status_code=400, detail="menu_overrides должен быть объектом или null")
    user.menu_overrides = overrides
    await db.commit()
    return {"detail": "Доступы обновлены"}


@router.post("/users")
async def add_user(
    payload: OrgUserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("owner")),
) -> dict:
    user = User(
        org_id=current_user.org_id,
        name=payload.name,
        phone=payload.phone,
        password_hash=get_password_hash(payload.password),
        role=UserRole(payload.role),
        pin_code=get_password_hash(payload.pin_code) if payload.pin_code else None,
        qr_secret="".join(random.choices(string.ascii_letters + string.digits, k=32)),
        qr_expires_at=datetime.now(timezone.utc) + timedelta(days=30),
    )
    db.add(user)
    await db.commit()
    return {"detail": "Сотрудник добавлен"}


@router.put("/users/{user_id}")
async def update_user(
    user_id: int,
    payload: OrgUserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("owner")),
) -> dict:
    user = (
        await db.execute(select(User).where(User.id == user_id, User.org_id == current_user.org_id, User.is_deleted.is_(False)))
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    if payload.role:
        user.role = UserRole(payload.role)
    if payload.pin_code:
        user.pin_code = get_password_hash(payload.pin_code)
    await db.commit()
    return {"detail": "Сотрудник обновлен"}


@router.delete("/users/{user_id}")
async def deactivate_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("owner")),
) -> dict:
    user = (
        await db.execute(select(User).where(User.id == user_id, User.org_id == current_user.org_id, User.is_deleted.is_(False)))
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    user.is_deleted = True
    user.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return {"detail": "Сотрудник деактивирован"}
