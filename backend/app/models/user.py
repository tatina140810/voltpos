from __future__ import annotations

import enum

from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin


class UserRole(str, enum.Enum):
    owner = "owner"
    seller = "seller"
    warehouse = "warehouse"


class User(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), nullable=False, default=UserRole.seller)
    pin_code: Mapped[str | None] = mapped_column(String(255), nullable=True)
    report_pin: Mapped[str | None] = mapped_column(String(255), nullable=True)
    qr_secret: Mapped[str] = mapped_column(String(128), nullable=False)
    qr_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    failed_pin_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    pin_locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Переопределения доступа к разделам меню. Формат: {"/stock": false, "/customers": true}.
    # NULL = пользоваться дефолтным набором по роли.
    menu_overrides: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
