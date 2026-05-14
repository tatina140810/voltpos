from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models.stock import StockMovement
from app.models.supplier import Supplier
from app.models.user import User
from app.schemas.supplier import SupplierCreate, SupplierOut, SupplierUpdate

router = APIRouter(prefix="/suppliers", tags=["suppliers"])


@router.get("", response_model=list[SupplierOut])
async def list_suppliers(
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
) -> list[SupplierOut]:
    """Список поставщиков. Поле usage_count = сколько приходов с этим поставщиком.
    Сортировка: сначала самые часто используемые, потом по имени."""
    usage_subq = (
        select(StockMovement.supplier_id, func.count(StockMovement.id).label("uc"))
        .where(StockMovement.supplier_id.is_not(None))
        .group_by(StockMovement.supplier_id)
        .subquery()
    )
    stmt = (
        select(Supplier, func.coalesce(usage_subq.c.uc, 0).label("uc"))
        .outerjoin(usage_subq, Supplier.id == usage_subq.c.supplier_id)
        .where(Supplier.org_id == current_user.org_id, Supplier.is_deleted.is_(False))
        .order_by(desc("uc"), Supplier.name.asc())
    )
    rows = (await db.execute(stmt)).all()
    return [
        SupplierOut(
            id=s.id,
            name=s.name,
            contact=s.contact,
            note=s.note,
            usage_count=int(uc or 0),
        )
        for s, uc in rows
    ]


@router.post("", response_model=SupplierOut, status_code=201)
async def create_supplier(
    payload: SupplierCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("owner")),
) -> Supplier:
    supplier = Supplier(
        org_id=current_user.org_id,
        name=payload.name.strip(),
        contact=payload.contact,
        note=payload.note,
    )
    db.add(supplier)
    await db.commit()
    await db.refresh(supplier)
    return supplier


@router.patch("/{supplier_id}", response_model=SupplierOut)
async def update_supplier(
    supplier_id: int,
    payload: SupplierUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("owner")),
) -> Supplier:
    supplier = (
        await db.execute(
            select(Supplier).where(
                Supplier.id == supplier_id,
                Supplier.org_id == current_user.org_id,
                Supplier.is_deleted.is_(False),
            )
        )
    ).scalar_one_or_none()
    if not supplier:
        raise HTTPException(status_code=404, detail="Поставщик не найден")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(supplier, field, value)
    await db.commit()
    await db.refresh(supplier)
    return supplier


@router.delete("/{supplier_id}", status_code=204)
async def delete_supplier(
    supplier_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("owner")),
) -> None:
    supplier = (
        await db.execute(
            select(Supplier).where(
                Supplier.id == supplier_id,
                Supplier.org_id == current_user.org_id,
                Supplier.is_deleted.is_(False),
            )
        )
    ).scalar_one_or_none()
    if not supplier:
        raise HTTPException(status_code=404, detail="Поставщик не найден")
    supplier.is_deleted = True
    supplier.deleted_at = datetime.now(timezone.utc)
    await db.commit()
