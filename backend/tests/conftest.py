"""Базовая инфраструктура тестов:
- Поднимает Postgres в Docker через testcontainers (один раз на сессию).
- Через Base.metadata.create_all создаёт схему (быстрее, чем гонять alembic).
- Перед каждым тестом TRUNCATE всех таблиц, чтобы тесты не влияли друг на друга.
- Подменяет get_db в FastAPI app, чтобы роутеры работали с тестовой БД.
- Готовит две организации (A и B) с owner/seller/warehouse — для тестов изоляции."""

from __future__ import annotations

import asyncio
import random
import string
from collections.abc import AsyncIterator
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from testcontainers.postgres import PostgresContainer

from app import database as db_module
from app.config import settings
from app.database import Base, TENANT_MODELS
from app.dependencies import get_current_user
from app.main import app
from app.models import (
    Customer,
    Delivery,
    Installment,
    Organization,
    Product,
    PushSubscription,
    Repair,
    Sale,
    StockMovement,
    User,
    Warranty,
)
from app.models.cash_withdrawal import CashWithdrawal
from app.models.organization import OrganizationPlan
from app.models.user import UserRole
from app.utils.security import create_access_token, get_password_hash


# ---------------------------------------------------------------------------
# Postgres container (session-scope) и engine
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def event_loop():
    """Один общий loop на всю сессию — тестам и testcontainers нужен один контекст."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
def postgres_container() -> PostgresContainer:
    container = PostgresContainer("postgres:16-alpine", driver="asyncpg")
    container.start()
    yield container
    container.stop()


@pytest_asyncio.fixture(scope="session")
async def test_engine(postgres_container: PostgresContainer):
    url = postgres_container.get_connection_url()
    # Перебиваем глобальные настройки и пересоздаём engine модуля database,
    # чтобы все вложенные `SessionLocal()` (например, из push_service) били в тестовую БД.
    settings.database_url = url
    db_module.engine = create_async_engine(url, echo=False, future=True)
    db_module.SessionLocal = async_sessionmaker(bind=db_module.engine, class_=AsyncSession, expire_on_commit=False)

    # Гарантируем, что TENANT_MODELS заполнено (main.py делает это при импорте).
    if not TENANT_MODELS:
        TENANT_MODELS[:] = [
            User, Product, StockMovement, Customer, Sale, Delivery,
            Repair, Installment, Warranty, CashWithdrawal, PushSubscription,
        ]

    async with db_module.engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield db_module.engine
    await db_module.engine.dispose()


@pytest_asyncio.fixture
async def db(test_engine) -> AsyncIterator[AsyncSession]:
    """Сессия на один тест. Перед тестом — чистим все таблицы кроме alembic_version."""
    async with db_module.engine.begin() as conn:
        # Узнаём имена таблиц из metadata в порядке, обратном FK-зависимостям.
        tables = ", ".join(f'"{t.name}"' for t in reversed(Base.metadata.sorted_tables))
        if tables:
            await conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    async with db_module.SessionLocal() as session:
        yield session


# ---------------------------------------------------------------------------
# Создание организаций и пользователей
# ---------------------------------------------------------------------------

def _rand_code() -> str:
    return "".join(random.choices(string.ascii_uppercase, k=3)) + "".join(random.choices(string.digits, k=3))


async def _make_org_with_users(db: AsyncSession, name: str, slug: str) -> dict:
    """Создаёт организацию с тремя сотрудниками: owner / seller / warehouse.
    Возвращает словарь со ссылками на сущности и готовые JWT-токены."""
    org = Organization(name=name, slug=slug, org_code=_rand_code(), plan=OrganizationPlan.start, is_active=True)
    db.add(org)
    await db.flush()

    def make_user(role: UserRole, label: str, pin: str) -> User:
        return User(
            org_id=org.id,
            name=f"{label} ({org.org_code})",
            phone=f"+99655500{random.randint(1000, 9999)}",
            password_hash=get_password_hash("password123"),
            role=role,
            pin_code=get_password_hash(pin),
            report_pin=get_password_hash("9999"),
            qr_secret="x" * 32,
            qr_expires_at=datetime.now(timezone.utc) + timedelta(days=30),
        )

    owner = make_user(UserRole.owner, "Owner", "1111")
    seller = make_user(UserRole.seller, "Seller", "2222")
    warehouse = make_user(UserRole.warehouse, "WH", "3333")
    db.add_all([owner, seller, warehouse])
    await db.flush()
    org.owner_id = owner.id
    await db.commit()

    return {
        "org": org,
        "owner": owner,
        "seller": seller,
        "warehouse": warehouse,
        "owner_token": create_access_token(str(owner.id), org.id, "owner", org.org_code),
        "seller_token": create_access_token(str(seller.id), org.id, "seller", org.org_code),
        "warehouse_token": create_access_token(str(warehouse.id), org.id, "warehouse", org.org_code),
    }


@pytest_asyncio.fixture
async def org_a(db: AsyncSession) -> dict:
    return await _make_org_with_users(db, "Org A", "org-a")


@pytest_asyncio.fixture
async def org_b(db: AsyncSession) -> dict:
    return await _make_org_with_users(db, "Org B", "org-b")


# ---------------------------------------------------------------------------
# Готовый товар (с приходом 100шт) для тестов продаж/возвратов
# ---------------------------------------------------------------------------

async def _make_product(db: AsyncSession, org_id: int, owner_id: int, name: str = "Test Product", barcode: str | None = None, qty: int = 100) -> Product:
    product = Product(
        org_id=org_id,
        name=name,
        barcode=barcode or "".join(random.choices(string.digits, k=13)),
        purchase_price=100,
        sale_price=200,
        warranty_months=0,
        min_stock=5,
    )
    db.add(product)
    await db.flush()
    if qty > 0:
        from app.models.stock import StockMovement, StockMovementType
        db.add(
            StockMovement(
                org_id=org_id,
                product_id=product.id,
                quantity=qty,
                type=StockMovementType.in_stock,
                reason="Тестовый приход",
                created_by=owner_id,
            )
        )
    await db.commit()
    await db.refresh(product)
    return product


@pytest_asyncio.fixture
async def product_a(db: AsyncSession, org_a: dict) -> Product:
    return await _make_product(db, org_a["org"].id, org_a["owner"].id)


@pytest_asyncio.fixture
async def product_b(db: AsyncSession, org_b: dict) -> Product:
    return await _make_product(db, org_b["org"].id, org_b["owner"].id, name="Product B")


# ---------------------------------------------------------------------------
# HTTP-клиент с подменой get_db (чтобы роутеры писали в тестовую БД)
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def client(test_engine) -> AsyncIterator[AsyncClient]:
    """ASGI-клиент к FastAPI app. Переопределяет get_db на сессию из тестового engine.
    org_id будет проставляться как обычно через JWT в TenantMiddleware/get_current_user."""

    async def override_get_db():
        async with db_module.SessionLocal() as s:
            yield s

    app.dependency_overrides[db_module.get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
