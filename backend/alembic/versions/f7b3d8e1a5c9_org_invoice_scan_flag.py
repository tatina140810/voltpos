"""organizations.has_invoice_scan (paid AI-feature, super-admin only)

Revision ID: f7b3d8e1a5c9
Revises: e1f5b8a2c7d4
Create Date: 2026-05-14
"""
from alembic import op
import sqlalchemy as sa


revision = "f7b3d8e1a5c9"
down_revision = "e1f5b8a2c7d4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column("has_invoice_scan", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("organizations", "has_invoice_scan")
