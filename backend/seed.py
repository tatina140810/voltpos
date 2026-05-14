import asyncio
import random
import string
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select

from app.database import SessionLocal
from app.models.organization import Organization, OrganizationPlan
from app.models.product import Product
from app.models.stock import StockMovement, StockMovementType
from app.models.user import User, UserRole
from app.utils.barcode import generate_ean13
from app.utils.security import get_password_hash


async def seed() -> None:
    async with SessionLocal() as db:
        org = (await db.execute(select(Organization).where(Organization.org_code == "TSF001"))).scalar_one_or_none()
        if not org:
            org = Organization(
                name="Техносфера",
                slug="technosfera",
                org_code="TSF001",
                plan=OrganizationPlan.business,
                is_active=True,
            )
            db.add(org)
            await db.flush()

        owner = (
            await db.execute(select(User).where(User.phone == "+996558055780", User.org_id == org.id, User.is_deleted.is_(False)))
        ).scalar_one_or_none()
        if not owner:
            owner = User(
                org_id=org.id,
                name="Owner",
                phone="+996558055780",
                password_hash=get_password_hash("admin123"),
                role=UserRole.owner,
                pin_code=get_password_hash("1234"),
                report_pin=get_password_hash("9999"),
                qr_secret="".join(random.choices(string.ascii_letters + string.digits, k=32)),
                qr_expires_at=datetime.now(timezone.utc) + timedelta(days=30),
            )
            db.add(owner)
            await db.flush()
            org.owner_id = owner.id

        sellers = [
            ("Seller 1", "+996555100001", "1234"),
            ("Seller 2", "+996555100002", "5678"),
        ]
        for seller_name, seller_phone, seller_pin in sellers:
            seller = (
                await db.execute(select(User).where(User.phone == seller_phone, User.org_id == org.id, User.is_deleted.is_(False)))
            ).scalar_one_or_none()
            if not seller:
                db.add(
                    User(
                        org_id=org.id,
                        name=seller_name,
                        phone=seller_phone,
                        password_hash=get_password_hash("seller123"),
                        role=UserRole.seller,
                        pin_code=get_password_hash(seller_pin),
                        qr_secret="".join(random.choices(string.ascii_letters + string.digits, k=32)),
                        qr_expires_at=datetime.now(timezone.utc) + timedelta(days=30),
                    )
                )

        products_data = [
            ("Телевизор", "TV", Decimal("23000.00"), Decimal("28000.00"), 24),
            ("Холодильник", "Kitchen", Decimal("35000.00"), Decimal("42000.00"), 24),
            ("Стиральная машина", "Kitchen", Decimal("26000.00"), Decimal("33000.00"), 24),
            ("Ноутбук", "Computers", Decimal("45000.00"), Decimal("59000.00"), 12),
            ("Чайник", "Kitchen", Decimal("900.00"), Decimal("1400.00"), 6),
        ]

        for idx, (name, category, purchase, sale, warranty_months) in enumerate(products_data, start=1):
            product = (await db.execute(select(Product).where(Product.name == name, Product.org_id == org.id))).scalar_one_or_none()
            if not product:
                product = Product(
                    org_id=org.id,
                    name=name,
                    category=category,
                    barcode=generate_ean13(idx),
                    barcode_generated=True,
                    purchase_price=purchase,
                    sale_price=sale,
                    warranty_months=warranty_months,
                    min_stock=1,
                )
                db.add(product)
                await db.flush()
                db.add(
                    StockMovement(
                        org_id=org.id,
                        product_id=product.id,
                        quantity=10,
                        type=StockMovementType.in_stock,
                        reason="Initial seed stock",
                        created_by=owner.id,
                    )
                )
        await db.commit()
        print("Seed completed")
        print("org_code: TSF001")
        print("owner: +996558055780 / admin123")
        print("seller1 PIN: 1234")
        print("seller2 PIN: 5678")


if __name__ == "__main__":
    asyncio.run(seed())
