from collections.abc import Callable

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import TenantSession, get_db
from app.models.platform_admin import PlatformAdmin
from app.models.user import User
from app.utils.platform_auth import PLATFORM_TOKEN_KIND
from app.utils.security import verify_password

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")
platform_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/super/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
    request: Request = None,
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Не удалось подтвердить пользователя",
    )
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        user_id: str | None = payload.get("sub")
        org_id = payload.get("org_id")
        if not user_id:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    if org_id is not None:
        db.info["org_id"] = int(org_id)
        if request is not None:
            request.state.org_id = int(org_id)

    result = await db.execute(
        select(User).where(User.id == int(user_id), User.is_deleted.is_(False), User.org_id == int(org_id))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise credentials_exception
    return user


def require_role(*roles: str) -> Callable:
    async def checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role.value == "owner":
            return current_user
        if current_user.role.value not in roles:
            raise HTTPException(status_code=403, detail="Недостаточно прав")
        return current_user

    return checker


async def require_report_pin(
    pin: str | None = Header(default=None, alias="X-Report-Pin"),
    current_user: User = Depends(get_current_user),
) -> User:
    if current_user.role.value != "owner":
        raise HTTPException(status_code=403, detail="Доступ только для owner")
    if not pin or not current_user.report_pin or not verify_password(pin, current_user.report_pin):
        raise HTTPException(status_code=403, detail="Неверный PIN для отчета")
    return current_user


def owner_only_price(product: dict, current_user: User) -> dict:
    if current_user.role.value != "owner":
        product.pop("purchase_price", None)
    return product


async def get_tenant_db(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> TenantSession:
    if getattr(request.state, "org_id", None) is not None:
        db.info["org_id"] = request.state.org_id
    return TenantSession(db)


async def get_current_platform_admin(
    token: str = Depends(platform_oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> PlatformAdmin:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Не удалось подтвердить администратора платформы",
    )
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        if payload.get("kind") != PLATFORM_TOKEN_KIND:
            raise credentials_exception
        admin_id = payload.get("sub")
        if not admin_id:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    admin = (
        await db.execute(select(PlatformAdmin).where(PlatformAdmin.id == int(admin_id)))
    ).scalar_one_or_none()
    if not admin:
        raise credentials_exception
    return admin
