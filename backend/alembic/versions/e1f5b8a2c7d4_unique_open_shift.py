"""one open shift per cashier (partial unique index)

Revision ID: e1f5b8a2c7d4
Revises: d7a9c3e5b1f4
Create Date: 2026-05-14
"""
from alembic import op


revision = "e1f5b8a2c7d4"
down_revision = "d7a9c3e5b1f4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE UNIQUE INDEX uq_one_open_shift_per_cashier "
        "ON shifts (org_id, cashier_id) WHERE status = 'open'"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_one_open_shift_per_cashier")
