"""invoice_scan_quota + usage tracking

Revision ID: e9c5d2a4b8f1
Revises: d8e6f3c2a9b4
Create Date: 2026-05-15
"""
from alembic import op
import sqlalchemy as sa


revision = "e9c5d2a4b8f1"
down_revision = "d8e6f3c2a9b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Месячная квота сканов накладных. По умолчанию 200 — пакет включён в подписку.
    # Супер-админ может изменить (за доп. оплату).
    op.add_column(
        "organizations",
        sa.Column("invoice_scan_quota", sa.Integer(), nullable=False, server_default="200"),
    )
    # Счётчик использования по месяцам. year_month — формат "YYYY-MM".
    op.create_table(
        "invoice_scan_usage",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False, index=True),
        sa.Column("year_month", sa.String(length=7), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("org_id", "year_month", name="uq_scan_usage_org_month"),
    )


def downgrade() -> None:
    op.drop_table("invoice_scan_usage")
    op.drop_column("organizations", "invoice_scan_quota")
