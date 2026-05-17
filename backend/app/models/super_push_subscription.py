from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SuperPushSubscription(Base):
    """Push-подписка супер-админа платформы (на отдельный admin-PWA).
    Не привязана к организации (как PushSubscription) — это для управления всеми магазинами."""

    __tablename__ = "super_push_subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    platform_admin_id: Mapped[int] = mapped_column(ForeignKey("platform_admins.id"), nullable=False, index=True)
    endpoint: Mapped[str] = mapped_column(String(1024), nullable=False, unique=True)
    p256dh: Mapped[str] = mapped_column(String(255), nullable=False)
    auth: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
