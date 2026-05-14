from pydantic import BaseModel


class LoginRequest(BaseModel):
    phone: str
    password: str


class PinLoginRequest(BaseModel):
    phone: str
    pin_code: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    org_code: str | None = None


class UserMe(BaseModel):
    id: int
    name: str
    phone: str
    role: str
    org_id: int
    menu_overrides: dict | None = None


class RegisterOrgRequest(BaseModel):
    org_name: str
    org_slug: str
    owner_name: str
    phone: str
    password: str
    pin_code: str
    report_pin: str


class OrgLoginRequest(BaseModel):
    org_code: str
    pin_code: str


class QrLoginRequest(BaseModel):
    qr_token: str
