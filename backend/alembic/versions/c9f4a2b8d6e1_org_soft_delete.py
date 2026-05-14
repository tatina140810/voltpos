"""organizations.is_deleted (soft delete)

Revision ID: c9f4a2b8d6e1
Revises: b6c9d4f2a3e7
Create Date: 2026-05-12
"""
from alembic import op
import sqlalchemy as sa


revision = "c9f4a2b8d6e1"
down_revision = "b6c9d4f2a3e7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("organizations", "is_deleted")
