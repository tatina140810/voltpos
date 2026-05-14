"""Multi-tenant изоляция: магазин A не видит данные магазина B и наоборот.
Проверяем по нескольким сущностям: продажи, инкассация, движения склада."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.conftest import auth_headers


pytestmark = pytest.mark.asyncio


async def test_org_b_does_not_see_org_a_sales(
    client: AsyncClient, org_a: dict, org_b: dict, product_a, product_b
):
    # Продажа в org A
    r_a = await client.post(
        "/sales",
        json={
            "total": "200",
            "paid_cash": "200",
            "delivery_type": "none",
            "status": "completed",
            "items": [{"product_id": product_a.id, "quantity": 1, "price": "200", "discount": "0"}],
        },
        headers=auth_headers(org_a["seller_token"]),
    )
    assert r_a.status_code == 200

    # Список продаж под токеном org B — должен быть пустым (продажа org A туда не попадает)
    list_b = await client.get("/sales", headers=auth_headers(org_b["seller_token"]))
    assert list_b.status_code == 200
    assert list_b.json() == []


async def test_org_b_cannot_read_org_a_sale_by_id(
    client: AsyncClient, org_a: dict, org_b: dict, product_a
):
    sale = (await client.post(
        "/sales",
        json={
            "total": "200",
            "paid_cash": "200",
            "delivery_type": "none",
            "status": "completed",
            "items": [{"product_id": product_a.id, "quantity": 1, "price": "200", "discount": "0"}],
        },
        headers=auth_headers(org_a["seller_token"]),
    )).json()

    # org B пытается прочитать продажу org A по id — TenantSession должна отфильтровать
    r = await client.get(f"/sales/{sale['id']}", headers=auth_headers(org_b["seller_token"]))
    assert r.status_code == 404


async def test_org_b_cash_withdrawals_isolated(client: AsyncClient, org_a: dict, org_b: dict):
    await client.post(
        "/cash-withdrawals",
        json={"recipient": "X-A", "amount": "500"},
        headers=auth_headers(org_a["seller_token"]),
    )
    list_b = await client.get("/cash-withdrawals", headers=auth_headers(org_b["seller_token"]))
    assert list_b.status_code == 200
    assert list_b.json() == []


async def test_org_b_stock_movements_isolated(
    client: AsyncClient, org_a: dict, org_b: dict, product_a, product_b
):
    """org A имеет приход 100шт по product_a (создан фикстурой), org B свой приход на product_b.
    Каждая видит только свои движения."""
    movs_a = await client.get("/stock/movements", headers=auth_headers(org_a["owner_token"]))
    assert movs_a.status_code == 200
    product_ids_a = {m["product_id"] for m in movs_a.json()}
    assert product_b.id not in product_ids_a

    movs_b = await client.get("/stock/movements", headers=auth_headers(org_b["owner_token"]))
    assert movs_b.status_code == 200
    product_ids_b = {m["product_id"] for m in movs_b.json()}
    assert product_a.id not in product_ids_b
