from datetime import datetime, timedelta, timezone

from jose import jwt

from app.config import settings

PLATFORM_TOKEN_KIND = "platform"
PLATFORM_TOKEN_TTL_MINUTES = 12 * 60


def create_platform_token(admin_id: int, email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=PLATFORM_TOKEN_TTL_MINUTES)
    payload = {"sub": str(admin_id), "email": email, "kind": PLATFORM_TOKEN_KIND, "exp": expire}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)
