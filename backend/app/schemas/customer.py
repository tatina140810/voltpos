from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


class CustomerBase(BaseModel):
    name: str
    phone: str
    address: str | None = None
    discount_percent: Decimal = Decimal("0.00")
    notes: str | None = None


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    address: str | None = None
    discount_percent: Decimal | None = None
    notes: str | None = None


class CustomerOut(CustomerBase):
    id: int

    model_config = {"from_attributes": True}


class CustomerListItem(CustomerBase):
    id: int
    purchase_count: int = 0
    debt_amount: Decimal = Decimal("0.00")
    oldest_debt_date: datetime | None = None

    model_config = {"from_attributes": True}


class CustomerStats(BaseModel):
    purchases_count: int
    purchases_total: Decimal
    debt_amount: Decimal


class CustomerSaleHistoryItem(BaseModel):
    id: int
    created_at: datetime
    total: Decimal
    status: str


class CustomerDetails(BaseModel):
    customer: CustomerOut
    stats: CustomerStats
    recent_purchases: list[CustomerSaleHistoryItem]


class CustomerDebtPayment(BaseModel):
    amount: Decimal
    method: str  # "cash" | "card" | "transfer"
    comment: str | None = None
