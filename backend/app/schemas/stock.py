from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class StockMovementCreate(BaseModel):
    product_id: int
    quantity: int = 0
    type: str
    reason: str | None = None
    supplier: str | None = None
    invoice_number: str | None = None
    production_date: date | None = None
    expiry_date: date | None = None
    batch_number: str | None = None
    # --- grocery v2 ---
    supplier_id: int | None = None        # FK; рядом с legacy text supplier
    cost_price: Decimal | None = None     # закупочная цена за единицу/кг
    quantity_decimal: Decimal | None = None  # для весовых (Product.kind == "weighed")
    writeoff_reason: str | None = None    # категория списания (только для type=writeoff)


class StockSummary(BaseModel):
    product_id: int
    name: str
    barcode: str
    # Для весовых in_qty/out_qty/balance могут быть дробными (например 1.500 кг).
    in_qty: Decimal
    out_qty: Decimal
    balance: Decimal
    min_expiry_date: date | None = None
    # Опционально — последняя закупочная цена, средневзв. себестоимость, маржа.
    last_cost_price: Decimal | None = None
    margin_pct: float | None = None


class RevisionItem(BaseModel):
    product_id: int
    # Поддерживаем дробные значения для весовых товаров (например, 1.350 кг).
    expected_qty: Decimal
    actual_qty: Decimal


class RevisionApply(BaseModel):
    items: list[RevisionItem]
