from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


class InstallmentOut(BaseModel):
    id: int
    sale_id: int
    customer_id: int
    total_amount: Decimal
    paid_amount: Decimal
    monthly_payment: Decimal
    next_payment_date: date
    status: str

    model_config = {"from_attributes": True}


class InstallmentPaymentCreate(BaseModel):
    amount: Decimal
    payment_method: str
    paid_at: datetime
