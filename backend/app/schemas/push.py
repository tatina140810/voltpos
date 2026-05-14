from __future__ import annotations

from pydantic import BaseModel, Field


class PushKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscribePayload(BaseModel):
    """Совпадает с форматом, который отдаёт PushSubscription.toJSON() в браузере."""

    endpoint: str = Field(..., max_length=2048)
    keys: PushKeys
    user_agent: str | None = Field(default=None, max_length=512)
