"""grocery fields on products and stock_movements

Revision ID: b6c9d4f2a3e7
Revises: a8e3f5d1c9b2
Create Date: 2026-05-12
"""
from alembic import op
import sqlalchemy as sa


revision = "b6c9d4f2a3e7"
down_revision = "a8e3f5d1c9b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("products", sa.Column("shelf_life_days", sa.Integer(), nullable=True))
    op.add_column("products", sa.Column("storage_temp", sa.String(length=20), nullable=True))
    op.add_column("products", sa.Column("country_of_origin", sa.String(length=50), nullable=True))
    op.add_column("products", sa.Column("manufacturer", sa.String(length=100), nullable=True))
    op.add_column(
        "products",
        sa.Column("vat_rate", sa.Numeric(5, 2), nullable=False, server_default="0"),
    )
    op.add_column(
        "products",
        sa.Column("min_days_before_expiry", sa.Integer(), nullable=False, server_default="0"),
    )

    op.add_column("stock_movements", sa.Column("production_date", sa.Date(), nullable=True))
    op.add_column("stock_movements", sa.Column("expiry_date", sa.Date(), nullable=True))
    op.add_column("stock_movements", sa.Column("batch_number", sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column("stock_movements", "batch_number")
    op.drop_column("stock_movements", "expiry_date")
    op.drop_column("stock_movements", "production_date")
    op.drop_column("products", "min_days_before_expiry")
    op.drop_column("products", "vat_rate")
    op.drop_column("products", "manufacturer")
    op.drop_column("products", "country_of_origin")
    op.drop_column("products", "storage_temp")
    op.drop_column("products", "shelf_life_days")
