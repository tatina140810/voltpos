"""Создание продажи: успех, недостаточный остаток, идемпотентность по offline_id."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.conftest import auth_headers


pytestmark = pytest.mark.asyncio


def _payload(product_id: int, quantity: int = 2, total: str = "400") -> dict:
    return {
        "total": total,
        "paid_cash": total,
        "paid_card": "0",
        "paid_transfer": "0",
        "delivery_type": "none",
        "status": "completed",
        "items": [{"product_id": product_id, "quantity": quantity, "price": "200", "discount": "0"}],
    }


async def test_create_sale_ok(client: AsyncClient, org_a: dict, product_a):
    r = await client.post("/sales", json=_payload(product_a.id), headers=auth_headers(org_a["seller_token"]))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["seller_id"] == org_a["seller"].id
    assert body["status"] == "completed"
    assert body["total"] == "400.00"


async def test_create_sale_insufficient_stock_400(client: AsyncClient, org_a: dict, product_a):
    # На складе 100 шт (фикстура). Пробуем продать 101 — должен отказать.
    payload = _payload(product_a.id, quantity=101, total="20200")
    r = await client.post("/sales", json=payload, headers=auth_headers(org_a["seller_token"]))
    assert r.status_code == 400
    assert "остатка" in r.json()["detail"].lower()


async def test_create_sale_offline_id_idempotent(client: AsyncClient, org_a: dict, product_a):
    """Повторная отправка с тем же offline_id не должна создать вторую продажу."""
    payload = _payload(product_a.id) | {"offline_id": "abc-123"}
    r1 = await client.post("/sales", json=payload, headers=auth_headers(org_a["seller_token"]))
    assert r1.status_code == 200
    sale_id_1 = r1.json()["id"]

    r2 = await client.post("/sales", json=payload, headers=auth_headers(org_a["seller_token"]))
    assert r2.status_code == 200
    sale_id_2 = r2.json()["id"]

    assert sale_id_1 == sale_id_2, "одинаковый offline_id должен вернуть существующую продажу"


async def test_create_sale_debt_without_customer_400(client: AsyncClient, org_a: dict, product_a):
    """Долговую продажу нельзя оформить без клиента."""
    payload = _payload(product_a.id) | {"status": "debt", "paid_cash": "0"}
    r = await client.post("/sales", json=payload, headers=auth_headers(org_a["seller_token"]))
    assert r.status_code == 400
    assert "клиент" in r.json()["detail"].lower()
