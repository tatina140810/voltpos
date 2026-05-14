"""add_soft_delete_to_sale_items

Revision ID: 8f4d2a3c1b90
Revises: 0001_initial
Create Date: 2026-05-05 21:13:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "8f4d2a3c1b90"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "sale_items",
        sa.Column("is_deleted", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column(
        "sale_items",
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("sale_items", "deleted_at")
    op.drop_column("sale_items", "is_deleted")
