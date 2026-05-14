"""add weighed products support

Revision ID: f2b9c4e8a1d5
Revises: e7b3a9f5d2c1
Create Date: 2026-05-12
"""
from alembic import op
import sqlalchemy as sa


revision = "f2b9c4e8a1d5"
down_revision = "e7b3a9f5d2c1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column("has_weighed_products", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("organizations", sa.Column("weighed_barcode_prefix", sa.String(length=2), nullable=True))
    op.add_column("organizations", sa.Column("weighed_code_length", sa.Integer(), nullable=True))
    op.add_column("organizations", sa.Column("weighed_grams_length", sa.Integer(), nullable=True))

    op.add_column(
        "products",
        sa.Column("kind", sa.String(length=10), nullable=False, server_default="piece"),
    )
    op.add_column("products", sa.Column("unit", sa.String(length=10), nullable=True))
    op.add_column("products", sa.Column("weighing_code", sa.String(length=10), nullable=True))
    op.create_index("ix_products_weighing_code", "products", ["weighing_code"])
    op.create_index(
        "uq_products_org_weighing_code",
        "products",
        ["org_id", "weighing_code"],
        unique=True,
        postgresql_where=sa.text("weighing_code IS NOT NULL AND is_deleted = FALSE"),
    )

    op.add_column("sale_items", sa.Column("weight_grams", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("sale_items", "weight_grams")
    op.drop_index("uq_products_org_weighing_code", table_name="products")
    op.drop_index("ix_products_weighing_code", table_name="products")
    op.drop_column("products", "weighing_code")
    op.drop_column("products", "unit")
    op.drop_column("products", "kind")
    op.drop_column("organizations", "weighed_grams_length")
    op.drop_column("organizations", "weighed_code_length")
    op.drop_column("organizations", "weighed_barcode_prefix")
    op.drop_column("organizations", "has_weighed_products")
