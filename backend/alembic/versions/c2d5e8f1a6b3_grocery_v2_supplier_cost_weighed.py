"""grocery v2: stock_movements.supplier_id/cost_price/quantity_decimal

Все поля nullable, существующие записи не трогаем. Бытовая техника
не получает дефолтных значений (поля остаются NULL).

Поле supplier_id — нормализация старого текстового supplier (text остаётся для legacy).
Поле cost_price — цена прихода для расчёта маржи (Product.purchase_price = средняя/последняя).
Поле quantity_decimal — для весовых товаров (Product.kind == "weighed"); для штучных
по-прежнему используется quantity (int).

Revision ID: c2d5e8f1a6b3
Revises: d2a8c6f3e7b9
Create Date: 2026-05-13
"""
from alembic import op
import sqlalchemy as sa


revision = "c2d5e8f1a6b3"
down_revision = "d2a8c6f3e7b9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "stock_movements",
        sa.Column("supplier_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_stock_movements_supplier_id",
        "stock_movements", "suppliers",
        ["supplier_id"], ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_stock_movements_supplier_id", "stock_movements", ["supplier_id"]
    )
    op.add_column(
        "stock_movements",
        sa.Column("cost_price", sa.Numeric(14, 2), nullable=True),
    )
    op.add_column(
        "stock_movements",
        sa.Column("quantity_decimal", sa.Numeric(14, 3), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("stock_movements", "quantity_decimal")
    op.drop_column("stock_movements", "cost_price")
    op.drop_index("ix_stock_movements_supplier_id", table_name="stock_movements")
    op.drop_constraint("fk_stock_movements_supplier_id", "stock_movements", type_="foreignkey")
    op.drop_column("stock_movements", "supplier_id")
