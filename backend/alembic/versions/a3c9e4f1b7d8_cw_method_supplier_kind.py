"""cash_withdrawals.method + supplier_id + kind (cashless inkas, supplier payments)

Revision ID: a3c9e4f1b7d8
Revises: b2e8a5d1c4f7
Create Date: 2026-05-16
"""
from alembic import op
import sqlalchemy as sa


revision = "a3c9e4f1b7d8"
down_revision = "b2e8a5d1c4f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # method: 'cash' | 'card' | 'transfer' — какой счёт/касса уменьшается.
    # kind:  'inkas' | 'owner' | 'expense' | 'supplier' | 'other' — что это за движение.
    # supplier_id: только если kind='supplier' — иначе NULL.
    op.add_column(
        "cash_withdrawals",
        sa.Column("method", sa.String(length=10), nullable=False, server_default="cash"),
    )
    op.add_column(
        "cash_withdrawals",
        sa.Column("kind", sa.String(length=12), nullable=False, server_default="expense"),
    )
    op.add_column(
        "cash_withdrawals",
        sa.Column("supplier_id", sa.Integer(), sa.ForeignKey("suppliers.id"), nullable=True),
    )
    op.create_index("ix_cw_supplier_id", "cash_withdrawals", ["supplier_id"])


def downgrade() -> None:
    op.drop_index("ix_cw_supplier_id", table_name="cash_withdrawals")
    op.drop_column("cash_withdrawals", "supplier_id")
    op.drop_column("cash_withdrawals", "kind")
    op.drop_column("cash_withdrawals", "method")
