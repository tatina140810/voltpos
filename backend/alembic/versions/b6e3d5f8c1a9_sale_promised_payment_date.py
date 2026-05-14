"""sales.promised_payment_date (debtor's promised return date)

Revision ID: b6e3d5f8c1a9
Revises: a3e7c2d9b4f8
Create Date: 2026-05-14
"""
from alembic import op
import sqlalchemy as sa


revision = "b6e3d5f8c1a9"
down_revision = "a3e7c2d9b4f8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "sales",
        sa.Column("promised_payment_date", sa.Date(), nullable=True),
    )
    op.create_index("ix_sales_promised_payment_date", "sales", ["promised_payment_date"])


def downgrade() -> None:
    op.drop_index("ix_sales_promised_payment_date", table_name="sales")
    op.drop_column("sales", "promised_payment_date")
