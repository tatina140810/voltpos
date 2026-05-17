"""super_push_subscriptions (web push for platform admins)

Revision ID: f8c2b5a9e6d1
Revises: d5b7e9c2f4a1
Create Date: 2026-05-17
"""
from alembic import op
import sqlalchemy as sa


revision = "f8c2b5a9e6d1"
down_revision = "d5b7e9c2f4a1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "super_push_subscriptions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("platform_admin_id", sa.Integer(), sa.ForeignKey("platform_admins.id"), nullable=False, index=True),
        sa.Column("endpoint", sa.String(length=1024), nullable=False, unique=True),
        sa.Column("p256dh", sa.String(length=255), nullable=False),
        sa.Column("auth", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )


def downgrade() -> None:
    op.drop_table("super_push_subscriptions")
