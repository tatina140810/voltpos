from datetime import datetime, timedelta, timezone

from jose import jwt
from passlib.context import CryptContext

from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(
    subject: str,
    org_id: int,
    role: str,
    org_code: str,
    ttl_minutes: int | None = None,
) -> str:
    expire_minutes = ttl_minutes if ttl_minutes is not None else settings.access_token_expire_minutes
    expire = datetime.now(timezone.utc) + timedelta(minutes=expire_minutes)
    payload = {"sub": subject, "org_id": str(org_id), "role": role, "org_code": org_code, "exp": expire}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)
