"""shifts.totals_snapshot (frozen Z-report snapshot)

Revision ID: f1b8d4a7e3c5
Revises: e9c5d2a4b8f1
Create Date: 2026-05-15
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision = "f1b8d4a7e3c5"
down_revision = "e9c5d2a4b8f1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "shifts",
        sa.Column("totals_snapshot", JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("shifts", "totals_snapshot")
