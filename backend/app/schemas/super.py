from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class SuperLoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1)


class SuperTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    admin: "SuperAdminMe"


class SuperAdminMe(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    name: str


class WeighedConfig(BaseModel):
    enabled: bool = False
    prefix: str | None = None
    code_length: int | None = None
    grams_length: int | None = None


class OrgListItem(BaseModel):
    id: int
    name: str
    org_code: str
    slug: str
    plan: str
    is_active: bool
    monthly_fee: int | None
    paid_until: date | None
    category: str | None
    employees_count: int
    status: Literal["active", "blocked", "no_payment_set"]
    days_left: int | None
    created_at: datetime
    weighed: WeighedConfig = WeighedConfig()


class OrgCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    slug: str | None = Field(default=None, max_length=100)
    monthly_fee: int | None = Field(default=None, ge=0)
    paid_until: date | None = None
    category: str | None = Field(default=None, max_length=100)
    owner_name: str = Field(min_length=1, max_length=255)
    owner_phone: str = Field(min_length=3, max_length=32)
    owner_password: str = Field(min_length=4)
    owner_pin: str = Field(min_length=4, max_length=6, pattern=r"^\d+$")
    owner_report_pin: str = Field(min_length=4, max_length=6, pattern=r"^\d+$")


class OrgUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    monthly_fee: int | None = Field(default=None, ge=0)
    paid_until: date | None = None
    is_active: bool | None = None
    category: str | None = Field(default=None, max_length=100)
    has_weighed_products: bool | None = None
    weighed_barcode_prefix: str | None = Field(default=None, pattern=r"^\d{1,2}$")
    weighed_code_length: int | None = Field(default=None, ge=1, le=10)
    weighed_grams_length: int | None = Field(default=None, ge=1, le=10)


class OrgEmployee(BaseModel):
    id: int
    name: str
    phone: str
    role: str
    has_pin: bool


class PaymentItem(BaseModel):
    id: int
    amount: int
    period_until: date
    paid_at: date
    note: str | None


class OrgDetails(BaseModel):
    id: int
    name: str
    org_code: str
    slug: str
    plan: str
    is_active: bool
    monthly_fee: int | None
    paid_until: date | None
    category: str | None
    status: Literal["active", "blocked", "no_payment_set"]
    days_left: int | None
    created_at: datetime
    weighed: WeighedConfig = WeighedConfig()
    business_type: str | None = None
    business_modules: dict[str, bool] = {}
    business_units: list[str] = []
    employees: list[OrgEmployee]
    payments: list[PaymentItem]


class BusinessTemplateItem(BaseModel):
    key: str
    name: str
    icon: str
    units: list[str]
    modules: dict[str, bool]
    default_categories: list[str]


class ApplyBusinessTypeRequest(BaseModel):
    business_type: str
    override_modules: dict[str, bool] | None = None


class UpdateModulesRequest(BaseModel):
    modules: dict[str, bool]


class OrgEmployeeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    phone: str = Field(min_length=3, max_length=32)
    role: Literal["owner", "seller", "warehouse"] = "seller"
    pin_code: str = Field(min_length=4, max_length=6, pattern=r"^\d+$")
    password: str = Field(min_length=4)


class OrgEmployeeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    role: Literal["owner", "seller", "warehouse"] | None = None
    pin_code: str | None = Field(default=None, min_length=4, max_length=6, pattern=r"^\d+$")


class PaymentCreate(BaseModel):
    amount: int = Field(ge=0)
    period_until: date
    paid_at: date | None = None
    note: str | None = Field(default=None, max_length=500)


class DashboardStats(BaseModel):
    total_orgs: int
    active_orgs: int
    blocked_orgs: int
    no_payment_set: int
    monthly_revenue: int
    expiring_soon: int


class ImportErrorItem(BaseModel):
    row: int
    reason: str


class ImportResult(BaseModel):
    created: int
    updated: int
    skipped: int
    errors: list[ImportErrorItem]


SuperTokenResponse.model_rebuild()
