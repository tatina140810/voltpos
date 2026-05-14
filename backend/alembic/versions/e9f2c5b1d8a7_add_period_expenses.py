"""period_expenses (saved salary + other expenses per report period)

Revision ID: e9f2c5b1d8a7
Revises: d3f8b1a4c9e2
Create Date: 2026-05-14
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision = "e9f2c5b1d8a7"
down_revision = "d3f8b1a4c9e2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "period_expenses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False, index=True),
        sa.Column("period_from", sa.Date(), nullable=False),
        sa.Column("period_to", sa.Date(), nullable=False),
        sa.Column("salary", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("other_expenses", JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("org_id", "period_from", "period_to", name="uq_period_expense_period"),
    )


def downgrade() -> None:
    op.drop_table("period_expenses")
