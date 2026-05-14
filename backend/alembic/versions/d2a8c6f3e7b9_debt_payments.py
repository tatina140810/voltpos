"""debt_payments table

Revision ID: d2a8c6f3e7b9
Revises: e5d3a7b2f9c4
Create Date: 2026-05-12
"""
from alembic import op
import sqlalchemy as sa


revision = "d2a8c6f3e7b9"
down_revision = "e5d3a7b2f9c4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "debt_payments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id"), nullable=False),
        sa.Column("sale_id", sa.Integer(), sa.ForeignKey("sales.id"), nullable=True),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("method", sa.String(length=20), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_debt_payments_org_created", "debt_payments", ["org_id", "created_at"])
    op.create_index("ix_debt_payments_customer", "debt_payments", ["customer_id"])


def downgrade() -> None:
    op.drop_index("ix_debt_payments_customer", table_name="debt_payments")
    op.drop_index("ix_debt_payments_org_created", table_name="debt_payments")
    op.drop_table("debt_payments")
