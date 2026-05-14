from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import Boolean, Date, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin


class Product(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    barcode: Mapped[str] = mapped_column(String(13), unique=True, nullable=False, index=True)
    barcode_generated: Mapped[bool] = mapped_column(Boolean, default=False)
    # Дополнительные ШК для одного товара (например, разные вкусы чипсов одного типа).
    # Все равноправны с barcode при сканировании. Хранится как JSONB-массив строк.
    extra_barcodes: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    purchase_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    sale_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    warranty_months: Mapped[int] = mapped_column(Integer, nullable=False, default=12)
    min_stock: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    photo_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    kind: Mapped[str] = mapped_column(String(10), nullable=False, default="piece")
    unit: Mapped[str | None] = mapped_column(String(10), nullable=True)
    weighing_code: Mapped[str | None] = mapped_column(String(10), nullable=True, index=True)
    shelf_life_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    storage_temp: Mapped[str | None] = mapped_column(String(20), nullable=True)
    country_of_origin: Mapped[str | None] = mapped_column(String(50), nullable=True)
    manufacturer: Mapped[str | None] = mapped_column(String(100), nullable=True)
    vat_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=Decimal("0"))
    min_days_before_expiry: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    promo_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    promo_until_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    storage_location: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Поставщик-«хозяин» товара. Используется в продуктовом магазине: чтобы видеть
    # «чей это товар» в карточке и в таблице склада. Не блокирует приём от других
    # поставщиков — это просто дефолт/основной.
    supplier_id: Mapped[int | None] = mapped_column(ForeignKey("suppliers.id"), nullable=True, index=True)
