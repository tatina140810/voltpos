"""refunds table + allow negative DebtPayment amount

Revision ID: b2e8a5d1c4f7
Revises: f1b8d4a7e3c5
Create Date: 2026-05-16
"""
from alembic import op
import sqlalchemy as sa


revision = "b2e8a5d1c4f7"
down_revision = "f1b8d4a7e3c5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Журнал возвратов денег клиенту. Один Refund на одно событие возврата
    # (всех или части позиций). Привязан к Sale и к Shift, чтобы Z-отчёт мог
    # показать отдельную строку «возврат нал».
    op.create_table(
        "refunds",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False, index=True),
        sa.Column("sale_id", sa.Integer(), sa.ForeignKey("sales.id"), nullable=False, index=True),
        sa.Column("shift_id", sa.Integer(), sa.ForeignKey("shifts.id"), nullable=True, index=True),
        sa.Column("cash", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("card", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("transfer", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )


def downgrade() -> None:
    op.drop_table("refunds")
