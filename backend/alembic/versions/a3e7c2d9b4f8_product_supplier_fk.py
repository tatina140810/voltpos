"""products.supplier_id (default supplier per product, grocery only)

Revision ID: a3e7c2d9b4f8
Revises: f4a8c1b9e6d3
Create Date: 2026-05-14
"""
from alembic import op
import sqlalchemy as sa


revision = "a3e7c2d9b4f8"
down_revision = "f4a8c1b9e6d3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column("supplier_id", sa.Integer(), sa.ForeignKey("suppliers.id"), nullable=True),
    )
    op.create_index("ix_products_supplier_id", "products", ["supplier_id"])


def downgrade() -> None:
    op.drop_index("ix_products_supplier_id", table_name="products")
    op.drop_column("products", "supplier_id")
