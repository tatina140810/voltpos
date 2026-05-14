from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.product import Product
from app.models.sale import Sale
from app.models.sale_item import SaleItem
from app.models.serial_number import SerialNumber
from app.models.user import User
from app.models.warranty import Warranty
from app.schemas.warranty import WarrantyOut
from app.utils.warranty_pdf import generate_warranty_pdf

router = APIRouter(prefix="/warranty", tags=["warranty"])


@router.get("/{sale_item_id}", response_model=WarrantyOut)
async def get_warranty(
    sale_item_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)
) -> Warranty:
    warranty = (await db.execute(select(Warranty).where(Warranty.sale_item_id == sale_item_id))).scalar_one_or_none()
    if not warranty:
        raise HTTPException(status_code=404, detail="Гарантия не найдена")
    return warranty


@router.post("/{sale_item_id}/generate", response_model=WarrantyOut)
async def generate_pdf(
    sale_item_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)
) -> Warranty:
    warranty = (await db.execute(select(Warranty).where(Warranty.sale_item_id == sale_item_id))).scalar_one_or_none()
    if not warranty:
        raise HTTPException(status_code=404, detail="Гарантия не найдена")
    sale_item = (await db.execute(select(SaleItem).where(SaleItem.id == sale_item_id))).scalar_one()
    sale = (await db.execute(select(Sale).where(Sale.id == sale_item.sale_id))).scalar_one()
    product = (await db.execute(select(Product).where(Product.id == sale_item.product_id))).scalar_one()
    serial = None
    if sale_item.serial_id:
        serial = (await db.execute(select(SerialNumber).where(SerialNumber.id == sale_item.serial_id))).scalar_one_or_none()

    warranty.pdf_url = generate_warranty_pdf(
        warranty_id=warranty.id,
        product_name=product.name,
        serial_number=serial.serial if serial else None,
        sale_date=sale.created_at if sale.created_at else datetime.now(timezone.utc),
        expires_at=warranty.expires_at,
    )
    await db.commit()
    await db.refresh(warranty)
    return warranty
