"""add cash_withdrawals

Revision ID: a3f7b9e1c8d2
Revises: c1a9b2e7d4f1
Create Date: 2026-05-09
"""
from alembic import op
import sqlalchemy as sa


revision = "a3f7b9e1c8d2"
down_revision = "c1a9b2e7d4f1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cash_withdrawals",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("issued_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("recipient", sa.String(length=255), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("reason", sa.String(length=1024), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_cash_withdrawals_org_id", "cash_withdrawals", ["org_id"])
    op.create_index("ix_cash_withdrawals_issued_by_id", "cash_withdrawals", ["issued_by_id"])


def downgrade() -> None:
    op.drop_index("ix_cash_withdrawals_issued_by_id", table_name="cash_withdrawals")
    op.drop_index("ix_cash_withdrawals_org_id", table_name="cash_withdrawals")
    op.drop_table("cash_withdrawals")
