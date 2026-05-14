from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


class SaleItemCreate(BaseModel):
    product_id: int
    serial_id: int | None = None
    quantity: int
    price: Decimal
    discount: Decimal = Decimal("0.00")
    weight_grams: int | None = None


class InstallmentCreateInput(BaseModel):
    monthly_payment: Decimal
    next_payment_date: date


class SaleCreate(BaseModel):
    customer_id: int | None = None
    total: Decimal
    paid_cash: Decimal = Decimal("0.00")
    paid_card: Decimal = Decimal("0.00")
    paid_transfer: Decimal = Decimal("0.00")
    delivery_type: str = "none"
    delivery_price: Decimal = Decimal("0.00")
    delivery_address: str | None = None
    delivery_date: date | None = None
    installation: bool = False
    installation_price: Decimal = Decimal("0.00")
    status: str = "completed"
    offline_id: str | None = None
    promised_payment_date: date | None = None  # для статуса debt — когда клиент обещал погасить
    items: list[SaleItemCreate]
    installment: InstallmentCreateInput | None = None


class SaleOut(BaseModel):
    id: int
    customer_id: int | None
    seller_id: int
    total: Decimal
    status: str
    offline_id: str | None

    model_config = {"from_attributes": True}


class SaleItemOut(BaseModel):
    id: int
    product_id: int
    product_name: str | None = None
    quantity: int
    price: Decimal


class SaleWithItemsOut(BaseModel):
    id: int
    customer_id: int | None
    customer_name: str | None = None
    seller_id: int
    total: Decimal
    status: str
    created_at: datetime
    items: list[SaleItemOut]


class ReturnRequest(BaseModel):
    return_item_ids: list[int]
    reason: str | None = None
    refund_method: str | None = None  # cash | card | transfer
