"""add organizations.category

Revision ID: e7b3a9f5d2c1
Revises: d4c8f1a2e5b6
Create Date: 2026-05-12
"""
from alembic import op
import sqlalchemy as sa


revision = "e7b3a9f5d2c1"
down_revision = "d4c8f1a2e5b6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("category", sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column("organizations", "category")
