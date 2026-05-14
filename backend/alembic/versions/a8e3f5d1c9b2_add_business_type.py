"""add organizations.business_type and business_settings

Revision ID: a8e3f5d1c9b2
Revises: f2b9c4e8a1d5
Create Date: 2026-05-12
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision = "a8e3f5d1c9b2"
down_revision = "f2b9c4e8a1d5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("business_type", sa.String(length=50), nullable=True))
    op.add_column(
        "organizations",
        sa.Column("business_settings", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
    )


def downgrade() -> None:
    op.drop_column("organizations", "business_settings")
    op.drop_column("organizations", "business_type")
