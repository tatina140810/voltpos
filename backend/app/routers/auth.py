import base64
import logging
import random
import string
from datetime import date, datetime, timedelta, timezone
from io import BytesIO

import qrcode
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.organization import Organization, OrganizationPlan
from app.models.user import User, UserRole
from app.schemas.auth import (
    LoginRequest,
    OrgLoginRequest,
    PinLoginRequest,
    QrLoginRequest,
    RegisterOrgRequest,
    TokenResponse,
    UserMe,
)
from app.utils.qr_auth import generate_qr_token, verify_qr_token
from app.utils.security import create_access_token, get_password_hash, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)


async def _generate_org_code(db: AsyncSession) -> str:
    while True:
        code = f"{''.join(random.choices(string.ascii_uppercase, k=3))}{''.join(random.choices(string.digits, k=3))}"
        existing = (await db.execute(select(Organization).where(Organization.org_code == code))).scalar_one_or_none()
        if not existing:
            return code


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    result = await db.execute(select(User).where(User.phone == payload.phone, User.is_deleted.is_(False)))
    user = result.scalar_one_or_none()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Неверный телефон или пароль")
    org = (await db.execute(select(Organization).where(Organization.id == user.org_id))).scalar_one()
    return TokenResponse(
        access_token=create_access_token(str(user.id), user.org_id, user.role.value, org.org_code),
        org_code=org.org_code,
    )


@router.post("/pin", response_model=TokenResponse)
async def login_by_pin(payload: PinLoginRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    result = await db.execute(select(User).where(User.phone == payload.phone, User.is_deleted.is_(False)))
    user = result.scalar_one_or_none()
    if not user or not user.pin_code or not verify_password(payload.pin_code, user.pin_code):
        raise HTTPException(status_code=401, detail="Неверный PIN")
    org = (await db.execute(select(Organization).where(Organization.id == user.org_id))).scalar_one()
    return TokenResponse(
        access_token=create_access_token(str(user.id), user.org_id, user.role.value, org.org_code),
        org_code=org.org_code,
    )


@router.post("/register-org", response_model=TokenResponse)
async def register_org(payload: RegisterOrgRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    org = Organization(
        name=payload.org_name,
        slug=payload.org_slug,
        org_code=await _generate_org_code(db),
        plan=OrganizationPlan.start,
        is_active=True,
    )
    db.add(org)
    await db.flush()

    owner = User(
        org_id=org.id,
        name=payload.owner_name,
        phone=payload.phone,
        password_hash=get_password_hash(payload.password),
        role=UserRole.owner,
        pin_code=get_password_hash(payload.pin_code),
        report_pin=get_password_hash(payload.report_pin),
        qr_secret="".join(random.choices(string.ascii_letters + string.digits, k=32)),
        qr_expires_at=datetime.now(timezone.utc) + timedelta(days=30),
    )
    db.add(owner)
    await db.flush()
    org.owner_id = owner.id
    await db.commit()
    return TokenResponse(
        access_token=create_access_token(str(owner.id), org.id, owner.role.value, org.org_code),
        org_code=org.org_code,
    )


@router.post("/org-login", response_model=TokenResponse)
async def org_login(payload: OrgLoginRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    """Вход по коду организации + PIN. Сервер перебирает всех сотрудников
    организации и логинит того, чей PIN совпал. PIN'ы внутри одной организации
    должны быть уникальны — это ответственность владельца. Если у двух
    пользователей одинаковый PIN, приоритет: owner → seller → warehouse, затем по id."""
    org = (
        await db.execute(
            select(Organization).where(
                Organization.org_code == payload.org_code, Organization.is_deleted.is_(False)
            )
        )
    ).scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Организация не найдена")
    if not org.is_active:
        raise HTTPException(status_code=403, detail="Магазин отключен. Обратитесь к администратору платформы")
    if org.paid_until is not None and org.paid_until < date.today():
        raise HTTPException(status_code=402, detail="Подписка истекла. Оплатите подписку")

    users = list(
        (
            await db.execute(
                select(User)
                .where(User.org_id == org.id, User.is_deleted.is_(False), User.pin_code.is_not(None))
                .order_by(User.role.asc(), User.id.asc())
            )
        ).scalars().all()
    )
    if not users:
        raise HTTPException(status_code=401, detail="PIN вход недоступен")

    now = datetime.now(timezone.utc)
    matched: User | None = None
    for u in users:
        if u.pin_locked_until and u.pin_locked_until > now:
            continue  # этот заблокирован — пробуем дальше, вдруг PIN другого сотрудника
        if verify_password(payload.pin_code, u.pin_code):
            matched = u
            break

    if not matched:
        # PIN не подошёл никому. Чтобы не дать перебирать вечно, наращиваем
        # счётчик ошибок у первого по приоритету пользователя (обычно — owner).
        primary = users[0]
        primary.failed_pin_attempts += 1
        if primary.failed_pin_attempts >= 3:
            primary.pin_locked_until = now + timedelta(minutes=5)
            logger.warning("PIN lock triggered for org=%s user=%s", org.org_code, primary.id)
        await db.commit()
        raise HTTPException(status_code=401, detail="Неверный PIN")

    matched.failed_pin_attempts = 0
    matched.pin_locked_until = None
    await db.commit()
    return TokenResponse(
        access_token=create_access_token(str(matched.id), org.id, matched.role.value, org.org_code, ttl_minutes=480),
        org_code=org.org_code,
    )


@router.post("/qr-login", response_model=TokenResponse)
async def qr_login(payload: QrLoginRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    data = verify_qr_token(payload.qr_token)
    if not data:
        raise HTTPException(status_code=401, detail="Невалидный QR токен")
    user = (
        await db.execute(
            select(User).where(User.id == data["user_id"], User.org_id == data["org_id"], User.is_deleted.is_(False))
        )
    ).scalar_one_or_none()
    org = (await db.execute(select(Organization).where(Organization.id == data["org_id"]))).scalar_one_or_none()
    if not user or not org or user.qr_expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="QR токен истек")
    return TokenResponse(
        access_token=create_access_token(str(user.id), org.id, user.role.value, org.org_code),
        org_code=org.org_code,
    )


@router.get("/qr-code/{user_id}")
async def get_qr_code(
    user_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
) -> dict[str, str]:
    if current_user.role.value != "owner":
        raise HTTPException(status_code=403, detail="Доступ только для owner")
    user = (
        await db.execute(select(User).where(User.id == user_id, User.org_id == current_user.org_id, User.is_deleted.is_(False)))
    ).scalar_one_or_none()
    org = (await db.execute(select(Organization).where(Organization.id == current_user.org_id))).scalar_one()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    token = generate_qr_token(user, org)
    img = qrcode.make(token)
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return {"qr_png_base64": encoded}


@router.post("/refresh-qr/{user_id}")
async def refresh_qr(
    user_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
) -> dict[str, str]:
    if current_user.role.value != "owner":
        raise HTTPException(status_code=403, detail="Доступ только для owner")
    user = (
        await db.execute(select(User).where(User.id == user_id, User.org_id == current_user.org_id, User.is_deleted.is_(False)))
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    user.qr_secret = "".join(random.choices(string.ascii_letters + string.digits, k=32))
    user.qr_expires_at = datetime.now(timezone.utc) + timedelta(days=30)
    await db.commit()
    return {"detail": "QR обновлен"}


@router.get("/me", response_model=UserMe)
async def me(current_user: User = Depends(get_current_user)) -> UserMe:
    return UserMe(
        id=current_user.id,
        name=current_user.name,
        phone=current_user.phone,
        role=current_user.role.value,
        org_id=current_user.org_id,
        menu_overrides=current_user.menu_overrides,
    )
