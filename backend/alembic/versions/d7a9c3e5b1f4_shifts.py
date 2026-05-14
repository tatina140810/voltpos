"""shifts (cashier shift open/close + X/Z reports)

Revision ID: d7a9c3e5b1f4
Revises: c8d4f1e9a2b6
Create Date: 2026-05-14
"""
from alembic import op
import sqlalchemy as sa


revision = "d7a9c3e5b1f4"
down_revision = "c8d4f1e9a2b6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "shifts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False, index=True),
        sa.Column("cashier_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("opening_cash", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("closing_cash_actual", sa.Numeric(12, 2), nullable=True),
        sa.Column("status", sa.String(length=10), nullable=False, server_default="open"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.add_column("sales", sa.Column("shift_id", sa.Integer(), sa.ForeignKey("shifts.id"), nullable=True))
    op.create_index("ix_sales_shift_id", "sales", ["shift_id"])
    op.add_column("cash_withdrawals", sa.Column("shift_id", sa.Integer(), sa.ForeignKey("shifts.id"), nullable=True))
    op.create_index("ix_cash_withdrawals_shift_id", "cash_withdrawals", ["shift_id"])


def downgrade() -> None:
    op.drop_index("ix_cash_withdrawals_shift_id", table_name="cash_withdrawals")
    op.drop_column("cash_withdrawals", "shift_id")
    op.drop_index("ix_sales_shift_id", table_name="sales")
    op.drop_column("sales", "shift_id")
    op.drop_table("shifts")
