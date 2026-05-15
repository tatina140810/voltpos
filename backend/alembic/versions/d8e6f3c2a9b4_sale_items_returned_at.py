"""sale_items.returned_at (anti double-return guard)

Revision ID: d8e6f3c2a9b4
Revises: c4a7e2b9d1f6
Create Date: 2026-05-15
"""
from alembic import op
import sqlalchemy as sa


revision = "d8e6f3c2a9b4"
down_revision = "c4a7e2b9d1f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "sale_items",
        sa.Column("returned_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("sale_items", "returned_at")
