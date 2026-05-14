"""Возврат позиций продажи: возврат всех (статус → returned), частичный возврат,
повторный возврат уже возвращённой продажи."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.conftest import auth_headers


pytestmark = pytest.mark.asyncio


async def _create_sale(client: AsyncClient, token: str, product_id: int, quantity: int = 2) -> dict:
    total = str(200 * quantity)
    r = await client.post(
        "/sales",
        json={
            "total": total,
            "paid_cash": total,
            "delivery_type": "none",
            "status": "completed",
            "items": [{"product_id": product_id, "quantity": quantity, "price": "200", "discount": "0"}],
        },
        headers=auth_headers(token),
    )
    assert r.status_code == 200, r.text
    return r.json()


async def test_return_all_items_marks_sale_returned(client: AsyncClient, org_a: dict, product_a):
    sale = await _create_sale(client, org_a["seller_token"], product_a.id, quantity=2)

    # Получаем sale_item ids
    items_resp = await client.get(f"/sales/by-product/{product_a.id}", headers=auth_headers(org_a["owner_token"]))
    assert items_resp.status_code == 200
    item_ids = [it["id"] for it in items_resp.json()[0]["items"]]

    r = await client.post(
        f"/sales/{sale['id']}/return",
        json={"return_item_ids": item_ids, "reason": "брак"},
        headers=auth_headers(org_a["owner_token"]),
    )
    assert r.status_code == 200
    assert r.json()["sale_status"] == "returned"


async def test_return_already_returned_400(client: AsyncClient, org_a: dict, product_a):
    sale = await _create_sale(client, org_a["seller_token"], product_a.id, quantity=2)
    items = (await client.get(f"/sales/by-product/{product_a.id}", headers=auth_headers(org_a["owner_token"]))).json()
    item_ids = [it["id"] for it in items[0]["items"]]

    # Первый возврат — ок
    await client.post(
        f"/sales/{sale['id']}/return",
        json={"return_item_ids": item_ids},
        headers=auth_headers(org_a["owner_token"]),
    )
    # Второй раз — отказ
    r = await client.post(
        f"/sales/{sale['id']}/return",
        json={"return_item_ids": item_ids},
        headers=auth_headers(org_a["owner_token"]),
    )
    assert r.status_code == 400


async def test_return_empty_list_400(client: AsyncClient, org_a: dict, product_a):
    sale = await _create_sale(client, org_a["seller_token"], product_a.id)
    r = await client.post(
        f"/sales/{sale['id']}/return",
        json={"return_item_ids": []},
        headers=auth_headers(org_a["owner_token"]),
    )
    assert r.status_code == 400
