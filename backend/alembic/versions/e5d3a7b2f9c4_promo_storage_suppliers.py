"""promo price, storage_location, suppliers table

Revision ID: e5d3a7b2f9c4
Revises: c9f4a2b8d6e1
Create Date: 2026-05-12
"""
from alembic import op
import sqlalchemy as sa


revision = "e5d3a7b2f9c4"
down_revision = "c9f4a2b8d6e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("products", sa.Column("promo_price", sa.Numeric(12, 2), nullable=True))
    op.add_column("products", sa.Column("promo_until_date", sa.Date(), nullable=True))
    op.add_column("products", sa.Column("storage_location", sa.String(length=100), nullable=True))

    op.create_table(
        "suppliers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("contact", sa.String(length=255), nullable=True),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_suppliers_org_id", "suppliers", ["org_id"])


def downgrade() -> None:
    op.drop_index("ix_suppliers_org_id", table_name="suppliers")
    op.drop_table("suppliers")
    op.drop_column("products", "storage_location")
    op.drop_column("products", "promo_until_date")
    op.drop_column("products", "promo_price")
