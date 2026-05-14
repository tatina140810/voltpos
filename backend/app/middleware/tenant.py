from jose import JWTError, jwt
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.config import settings


class TenantMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request.state.org_id = None
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.removeprefix("Bearer ").strip()
            try:
                payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
                org_id = payload.get("org_id")
                request.state.org_id = int(org_id) if org_id is not None else None
            except (JWTError, ValueError):
                request.state.org_id = None
        return await call_next(request)
