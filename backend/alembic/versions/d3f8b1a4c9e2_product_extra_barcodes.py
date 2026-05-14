"""products.extra_barcodes (JSONB array of additional barcodes)

Revision ID: d3f8b1a4c9e2
Revises: c2d5e8f1a6b3
Create Date: 2026-05-14
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision = "d3f8b1a4c9e2"
down_revision = "c2d5e8f1a6b3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column("extra_barcodes", JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("products", "extra_barcodes")
