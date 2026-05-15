"""revisions + revision_items (full inventory module)

Revision ID: c4a7e2b9d1f6
Revises: f7b3d8e1a5c9
Create Date: 2026-05-15
"""
from alembic import op
import sqlalchemy as sa


revision = "c4a7e2b9d1f6"
down_revision = "f7b3d8e1a5c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "revisions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False, index=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("status", sa.String(length=12), nullable=False, server_default="active"),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    # Только одна активная ревизия на организацию.
    op.execute(
        "CREATE UNIQUE INDEX uq_one_active_revision_per_org "
        "ON revisions (org_id) WHERE status = 'active'"
    )

    op.create_table(
        "revision_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("revision_id", sa.Integer(), sa.ForeignKey("revisions.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id"), nullable=False, index=True),
        sa.Column("expected_qty", sa.Numeric(14, 3), nullable=False, server_default="0"),
        sa.Column("actual_qty", sa.Numeric(14, 3), nullable=False, server_default="0"),
        sa.Column("counted_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("revision_id", "product_id", name="uq_revision_item_product"),
    )


def downgrade() -> None:
    op.drop_table("revision_items")
    op.execute("DROP INDEX IF EXISTS uq_one_active_revision_per_org")
    op.drop_table("revisions")
