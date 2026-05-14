"""Роли: продавец не может удалять продажи / инкассации / товары.
Owner-only push subscribe. Warehouse role не лезет в отчёты."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.conftest import auth_headers


pytestmark = pytest.mark.asyncio


async def test_seller_cannot_delete_sale(client: AsyncClient, org_a: dict, product_a):
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

    r = await client.delete(f"/sales/{sale['id']}", headers=auth_headers(org_a["seller_token"]))
    assert r.status_code == 403


async def test_owner_can_delete_sale(client: AsyncClient, org_a: dict, product_a):
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

    r = await client.delete(f"/sales/{sale['id']}", headers=auth_headers(org_a["owner_token"]))
    assert r.status_code == 200


async def test_seller_cannot_subscribe_to_push(client: AsyncClient, org_a: dict):
    """Push доступен только для owner — это проектное решение."""
    r = await client.post(
        "/push/subscribe",
        json={
            "endpoint": "https://fcm.googleapis.com/fake/endpoint",
            "keys": {"p256dh": "x", "auth": "y"},
        },
        headers=auth_headers(org_a["seller_token"]),
    )
    assert r.status_code == 403


async def test_owner_can_subscribe_to_push(client: AsyncClient, org_a: dict):
    r = await client.post(
        "/push/subscribe",
        json={
            "endpoint": "https://fcm.googleapis.com/fake/endpoint-owner",
            "keys": {"p256dh": "x", "auth": "y"},
        },
        headers=auth_headers(org_a["owner_token"]),
    )
    assert r.status_code == 200


async def test_seller_writeoff_forbidden(client: AsyncClient, org_a: dict, product_a):
    """Списания доступны только owner и warehouse. Seller — 403."""
    r = await client.post(
        "/stock/movement",
        json={"product_id": product_a.id, "quantity": 1, "type": "writeoff", "reason": "брак"},
        headers=auth_headers(org_a["seller_token"]),
    )
    assert r.status_code == 403
