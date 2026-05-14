"""users.menu_overrides (per-user UI menu access overrides)

Revision ID: f4a8c1b9e6d3
Revises: e9f2c5b1d8a7
Create Date: 2026-05-14
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision = "f4a8c1b9e6d3"
down_revision = "e9f2c5b1d8a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("menu_overrides", JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "menu_overrides")
