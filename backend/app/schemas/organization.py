from pydantic import BaseModel


class OrganizationOut(BaseModel):
    id: int
    name: str
    slug: str
    org_code: str
    plan: str
    logo_url: str | None
    primary_color: str | None
    is_active: bool
    has_weighed_products: bool = False
    weighed_barcode_prefix: str | None = None
    weighed_code_length: int | None = None
    weighed_grams_length: int | None = None
    business_type: str | None = None
    business_settings: dict = {}
    has_invoice_scan: bool = False

    model_config = {"from_attributes": True}


class OrganizationUpdate(BaseModel):
    name: str | None = None
    logo_url: str | None = None
    primary_color: str | None = None


class OrgUserCreate(BaseModel):
    name: str
    phone: str
    role: str
    password: str
    pin_code: str | None = None


class OrgUserUpdate(BaseModel):
    role: str | None = None
    pin_code: str | None = None
