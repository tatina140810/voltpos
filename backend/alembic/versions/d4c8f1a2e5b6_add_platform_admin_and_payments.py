"""add platform_admins, payments, organizations.monthly_fee/paid_until

Revision ID: d4c8f1a2e5b6
Revises: b8e2c1f4a9d3
Create Date: 2026-05-12
"""
from alembic import op
import sqlalchemy as sa


revision = "d4c8f1a2e5b6"
down_revision = "b8e2c1f4a9d3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "platform_admins",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("email", name="uq_platform_admins_email"),
    )
    op.create_index("ix_platform_admins_email", "platform_admins", ["email"])

    op.add_column("organizations", sa.Column("monthly_fee", sa.Integer(), nullable=True))
    op.add_column("organizations", sa.Column("paid_until", sa.Date(), nullable=True))

    op.create_table(
        "payments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("period_until", sa.Date(), nullable=False),
        sa.Column("paid_at", sa.Date(), nullable=False),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("created_by_admin_id", sa.Integer(), sa.ForeignKey("platform_admins.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_payments_org_id", "payments", ["org_id"])


def downgrade() -> None:
    op.drop_index("ix_payments_org_id", table_name="payments")
    op.drop_table("payments")
    op.drop_column("organizations", "paid_until")
    op.drop_column("organizations", "monthly_fee")
    op.drop_index("ix_platform_admins_email", table_name="platform_admins")
    op.drop_table("platform_admins")
