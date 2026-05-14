from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Self

from pydantic import BaseModel, model_validator


class ProductBase(BaseModel):
    name: str
    description: str | None = None
    category: str | None = None
    sale_price: Decimal
    purchase_price: Decimal = Decimal("0.00")
    warranty_months: int = 12
    min_stock: int = 0
    kind: str = "piece"
    unit: str | None = None
    weighing_code: str | None = None
    shelf_life_days: int | None = None
    storage_temp: str | None = None
    country_of_origin: str | None = None
    manufacturer: str | None = None
    vat_rate: Decimal = Decimal("0")
    min_days_before_expiry: int = 0
    promo_price: Decimal | None = None
    promo_until_date: date | None = None
    storage_location: str | None = None
    supplier_id: int | None = None


class ProductCreate(ProductBase):
    barcode: str | None = None
    barcode_generated: bool = False
    extra_barcodes: list[str] | None = None

    @model_validator(mode="after")
    def barcode_or_generate(self) -> Self:
        if self.barcode_generated:
            return self
        if self.barcode is None or not str(self.barcode).strip():
            raise ValueError("Укажите штрихкод или выберите автогенерацию")
        return self


class ProductUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    category: str | None = None
    sale_price: Decimal | None = None
    purchase_price: Decimal | None = None
    warranty_months: int | None = None
    min_stock: int | None = None
    barcode: str | None = None
    barcode_generated: bool | None = None
    extra_barcodes: list[str] | None = None
    kind: str | None = None
    unit: str | None = None
    weighing_code: str | None = None
    shelf_life_days: int | None = None
    storage_temp: str | None = None
    country_of_origin: str | None = None
    manufacturer: str | None = None
    vat_rate: Decimal | None = None
    min_days_before_expiry: int | None = None
    promo_price: Decimal | None = None
    promo_until_date: date | None = None
    storage_location: str | None = None
    supplier_id: int | None = None


class ProductOut(ProductBase):
    id: int
    barcode: str
    barcode_generated: bool
    extra_barcodes: list[str] | None = None

    model_config = {"from_attributes": True}
