from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel


class CashWithdrawalCreate(BaseModel):
    recipient: str
    amount: Decimal
    reason: str | None = None


class CashWithdrawalOut(BaseModel):
    id: int
    recipient: str
    amount: Decimal
    reason: str | None
    issued_by_id: int
    issued_by_name: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
