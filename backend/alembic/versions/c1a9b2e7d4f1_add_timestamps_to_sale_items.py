"""add_timestamps_to_sale_items

Revision ID: c1a9b2e7d4f1
Revises: 8f4d2a3c1b90
Create Date: 2026-05-05 21:16:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "c1a9b2e7d4f1"
down_revision = "8f4d2a3c1b90"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "sale_items",
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.add_column(
        "sale_items",
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("sale_items", "updated_at")
    op.drop_column("sale_items", "created_at")
