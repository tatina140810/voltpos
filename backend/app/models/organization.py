from __future__ import annotations

import enum
from datetime import date

from sqlalchemy import Boolean, Date, Enum, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.mixins import TimestampMixin


class OrganizationPlan(str, enum.Enum):
    start = "start"
    business = "business"
    plus = "plus"


class Organization(Base, TimestampMixin):
    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    org_code: Mapped[str] = mapped_column(String(6), unique=True, nullable=False, index=True)
    plan: Mapped[OrganizationPlan] = mapped_column(Enum(OrganizationPlan), nullable=False, default=OrganizationPlan.start)
    logo_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    primary_color: Mapped[str | None] = mapped_column(String(16), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    monthly_fee: Mapped[int | None] = mapped_column(Integer, nullable=True)
    paid_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    has_weighed_products: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    weighed_barcode_prefix: Mapped[str | None] = mapped_column(String(2), nullable=True)
    weighed_code_length: Mapped[int | None] = mapped_column(Integer, nullable=True)
    weighed_grams_length: Mapped[int | None] = mapped_column(Integer, nullable=True)
    business_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    business_settings: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
