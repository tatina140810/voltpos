from datetime import datetime

from pydantic import BaseModel


class WarrantyOut(BaseModel):
    id: int
    sale_item_id: int
    product_id: int
    serial_id: int | None
    issued_at: datetime
    expires_at: datetime
    pdf_url: str | None

    model_config = {"from_attributes": True}
