"""stock_movements.writeoff_reason (category for losses report)

Revision ID: c8d4f1e9a2b6
Revises: b6e3d5f8c1a9
Create Date: 2026-05-14
"""
from alembic import op
import sqlalchemy as sa


revision = "c8d4f1e9a2b6"
down_revision = "b6e3d5f8c1a9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "stock_movements",
        sa.Column("writeoff_reason", sa.String(length=20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("stock_movements", "writeoff_reason")
