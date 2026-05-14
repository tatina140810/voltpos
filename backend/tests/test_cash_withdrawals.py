"""Инкассация: создание, валидация, удаление только владельцем, агрегат за сегодня."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.conftest import auth_headers


pytestmark = pytest.mark.asyncio


async def test_create_withdrawal_ok(client: AsyncClient, org_a: dict):
    r = await client.post(
        "/cash-withdrawals",
        json={"recipient": "Поставщик 'Заря'", "amount": "1500.00", "reason": "Закупка"},
        headers=auth_headers(org_a["seller_token"]),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["recipient"] == "Поставщик 'Заря'"
    assert body["amount"] == "1500.00"
    assert body["issued_by_id"] == org_a["seller"].id


async def test_create_withdrawal_negative_amount_400(client: AsyncClient, org_a: dict):
    r = await client.post(
        "/cash-withdrawals",
        json={"recipient": "X", "amount": "-100"},
        headers=auth_headers(org_a["seller_token"]),
    )
    assert r.status_code == 400


async def test_create_withdrawal_empty_recipient_400(client: AsyncClient, org_a: dict):
    r = await client.post(
        "/cash-withdrawals",
        json={"recipient": "   ", "amount": "100"},
        headers=auth_headers(org_a["seller_token"]),
    )
    assert r.status_code == 400


async def test_delete_withdrawal_seller_forbidden(client: AsyncClient, org_a: dict):
    """Только владелец может удалять инкассацию."""
    created = await client.post(
        "/cash-withdrawals",
        json={"recipient": "X", "amount": "100"},
        headers=auth_headers(org_a["seller_token"]),
    )
    wid = created.json()["id"]
    r = await client.delete(f"/cash-withdrawals/{wid}", headers=auth_headers(org_a["seller_token"]))
    assert r.status_code == 403


async def test_today_total_aggregates(client: AsyncClient, org_a: dict):
    for amount in ("100", "250", "50"):
        await client.post(
            "/cash-withdrawals",
            json={"recipient": "X", "amount": amount},
            headers=auth_headers(org_a["seller_token"]),
        )
    r = await client.get("/cash-withdrawals/today/total", headers=auth_headers(org_a["seller_token"]))
    assert r.status_code == 200
    assert r.json()["total"] in ("400", "400.00")
