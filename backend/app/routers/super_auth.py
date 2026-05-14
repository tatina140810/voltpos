from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_platform_admin
from app.models.platform_admin import PlatformAdmin
from app.schemas.super import SuperAdminMe, SuperLoginRequest, SuperTokenResponse
from app.utils.platform_auth import create_platform_token
from app.utils.security import verify_password

router = APIRouter(prefix="/super/auth", tags=["super-auth"])


@router.post("/login", response_model=SuperTokenResponse)
async def super_login(payload: SuperLoginRequest, db: AsyncSession = Depends(get_db)) -> SuperTokenResponse:
    admin = (
        await db.execute(select(PlatformAdmin).where(PlatformAdmin.email == payload.email.lower()))
    ).scalar_one_or_none()
    if not admin or not verify_password(payload.password, admin.password_hash):
        raise HTTPException(status_code=401, detail="Неверный email или пароль")

    admin.last_login_at = datetime.now(timezone.utc)
    await db.commit()

    token = create_platform_token(admin.id, admin.email)
    return SuperTokenResponse(
        access_token=token,
        admin=SuperAdminMe.model_validate(admin),
    )


@router.get("/me", response_model=SuperAdminMe)
async def super_me(admin: PlatformAdmin = Depends(get_current_platform_admin)) -> SuperAdminMe:
    return SuperAdminMe.model_validate(admin)
