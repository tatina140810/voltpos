from pydantic import BaseModel, Field


class SupplierCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    contact: str | None = Field(default=None, max_length=255)
    note: str | None = Field(default=None, max_length=500)


class SupplierUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    contact: str | None = Field(default=None, max_length=255)
    note: str | None = Field(default=None, max_length=500)


class SupplierOut(BaseModel):
    id: int
    name: str
    contact: str | None
    note: str | None
    usage_count: int = 0  # сколько раз использован в приходах (для сортировки)

    model_config = {"from_attributes": True}
