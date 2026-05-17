"""orders + order_payments (customer prepayments / preorders)

Revision ID: d5b7e9c2f4a1
Revises: a3c9e4f1b7d8
Create Date: 2026-05-16
"""
from alembic import op
import sqlalchemy as sa


revision = "d5b7e9c2f4a1"
down_revision = "a3c9e4f1b7d8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "orders",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False, index=True),
        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id"), nullable=False, index=True),
        sa.Column("title", sa.String(length=512), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("total_expected", sa.Numeric(12, 2), nullable=True),
        sa.Column("status", sa.String(length=12), nullable=False, server_default="open"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("fulfilled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sale_id", sa.Integer(), sa.ForeignKey("sales.id"), nullable=True, index=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_table(
        "order_payments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("method", sa.String(length=10), nullable=False),  # cash | card | transfer
        sa.Column("kind", sa.String(length=10), nullable=False, server_default="deposit"),  # deposit | refund
        sa.Column("shift_id", sa.Integer(), sa.ForeignKey("shifts.id"), nullable=True, index=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )


def downgrade() -> None:
    op.drop_table("order_payments")
    op.drop_table("orders")
