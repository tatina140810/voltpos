from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

# Допустимые значения method и kind на уровне API (синхронизировать с миграцией).
CWMethod = Literal["cash", "card", "transfer"]
CWKind = Literal["inkas", "owner", "expense", "supplier", "other"]


class CashWithdrawalCreate(BaseModel):
    recipient: str
    amount: Decimal
    reason: str | None = None
    method: CWMethod = "cash"
    kind: CWKind = "expense"
    supplier_id: int | None = None


class CashWithdrawalOut(BaseModel):
    id: int
    recipient: str
    amount: Decimal
    reason: str | None
    method: CWMethod = "cash"
    kind: CWKind = "expense"
    supplier_id: int | None = None
    supplier_name: str | None = None
    issued_by_id: int
    issued_by_name: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
