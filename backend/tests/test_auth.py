"""Аутентификация: org-login по PIN, проверка ролей, отказ невалидного PIN."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


pytestmark = pytest.mark.asyncio


async def test_org_login_finds_owner_by_pin(client: AsyncClient, org_a: dict):
    """Owner должен войти, введя свой PIN — даже если в org есть seller/warehouse раньше по id."""
    r = await client.post("/auth/org-login", json={"org_code": org_a["org"].org_code, "pin_code": "1111"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert "access_token" in data
    assert data["org_code"] == org_a["org"].org_code


async def test_org_login_finds_seller_by_pin(client: AsyncClient, org_a: dict):
    """Seller тоже должен входить своим PIN — раньше старый код брал только первого по id."""
    r = await client.post("/auth/org-login", json={"org_code": org_a["org"].org_code, "pin_code": "2222"})
    assert r.status_code == 200
    # JWT-токен содержит role — декодируем и проверим
    import base64
    import json
    payload = json.loads(base64.urlsafe_b64decode(r.json()["access_token"].split(".")[1] + "=="))
    assert payload["role"] == "seller"


async def test_org_login_wrong_pin_401(client: AsyncClient, org_a: dict):
    r = await client.post("/auth/org-login", json={"org_code": org_a["org"].org_code, "pin_code": "0000"})
    assert r.status_code == 401


async def test_org_login_unknown_org_404(client: AsyncClient):
    r = await client.post("/auth/org-login", json={"org_code": "ZZZ999", "pin_code": "1111"})
    assert r.status_code == 404
