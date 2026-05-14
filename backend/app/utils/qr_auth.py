import base64
import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone

from app.config import settings
from app.models.organization import Organization
from app.models.user import User


def _sign(payload: str) -> str:
    digest = hmac.new(settings.secret_key.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode("utf-8")


def generate_qr_token(user: User, org: Organization) -> str:
    exp = int((datetime.now(timezone.utc) + timedelta(days=30)).timestamp())
    payload = {"org_id": org.id, "user_id": user.id, "secret": user.qr_secret, "exp": exp}
    payload_raw = json.dumps(payload, separators=(",", ":"), sort_keys=True)
    signature = _sign(payload_raw)
    token = f"{base64.urlsafe_b64encode(payload_raw.encode('utf-8')).decode('utf-8')}.{signature}"
    return token


def verify_qr_token(token: str) -> dict | None:
    try:
        raw, signature = token.split(".", 1)
        payload_raw = base64.urlsafe_b64decode(raw.encode("utf-8")).decode("utf-8")
        if not hmac.compare_digest(_sign(payload_raw), signature):
            return None
        payload = json.loads(payload_raw)
        if int(payload["exp"]) < int(datetime.now(timezone.utc).timestamp()):
            return None
        return {"org_id": int(payload["org_id"]), "user_id": int(payload["user_id"])}
    except Exception:
        return None
