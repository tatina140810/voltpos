"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2025-01-01 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '0001_initial'
down_revision = None
branch_labels = None
depends_on = None

def upgrade() -> None:
    # ORGANIZATIONS (первой — все остальные ссылаются на неё)
    op.create_table('organizations',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('slug', sa.String(100), unique=True, nullable=False),
        sa.Column('org_code', sa.String(10), unique=True, nullable=False),
        sa.Column('plan', sa.Enum('start','business','plus', name='organizationplan'), default='start'),
        sa.Column('logo_url', sa.String(500)),
        sa.Column('primary_color', sa.String(7), default='#4F46E5'),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('owner_id', sa.Integer()),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # USERS
    op.create_table('users',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('org_id', sa.Integer(), sa.ForeignKey('organizations.id')),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('phone', sa.String(20), unique=True, nullable=False),
        sa.Column('password_hash', sa.String(255)),
        sa.Column('role', sa.Enum('owner','seller','warehouse', name='userrole'), default='seller'),
        sa.Column('pin_code', sa.String(255)),
        sa.Column('report_pin', sa.String(255)),
        sa.Column('qr_secret', sa.String(255)),
        sa.Column('qr_expires_at', sa.DateTime()),
        sa.Column('failed_pin_attempts', sa.Integer(), default=0),
        sa.Column('pin_locked_until', sa.DateTime()),
        sa.Column('is_deleted', sa.Boolean(), default=False),
        sa.Column('deleted_at', sa.DateTime()),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # FK owner_id в organizations
    op.create_foreign_key(None, 'organizations', 'users', ['owner_id'], ['id'])

    # CUSTOMERS
    op.create_table('customers',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('org_id', sa.Integer(), sa.ForeignKey('organizations.id')),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('phone', sa.String(20)),
        sa.Column('address', sa.Text()),
        sa.Column('discount_percent', sa.Numeric(5,2), default=0),
        sa.Column('notes', sa.Text()),
        sa.Column('is_deleted', sa.Boolean(), default=False),
        sa.Column('deleted_at', sa.DateTime()),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # PRODUCTS
    op.create_table('products',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('org_id', sa.Integer(), sa.ForeignKey('organizations.id')),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text()),
        sa.Column('category', sa.String(100)),
        sa.Column('barcode', sa.String(50), unique=True),
        sa.Column('barcode_generated', sa.Boolean(), default=False),
        sa.Column('purchase_price', sa.Numeric(12,2)),
        sa.Column('sale_price', sa.Numeric(12,2)),
        sa.Column('warranty_months', sa.Integer(), default=0),
        sa.Column('min_stock', sa.Integer(), default=0),
        sa.Column('photo_url', sa.String(500)),
        sa.Column('is_deleted', sa.Boolean(), default=False),
        sa.Column('deleted_at', sa.DateTime()),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # SERIAL NUMBERS
    op.create_table('serial_numbers',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('org_id', sa.Integer(), sa.ForeignKey('organizations.id')),
        sa.Column('product_id', sa.Integer(), sa.ForeignKey('products.id')),
        sa.Column('serial', sa.String(255), nullable=False),
        sa.Column('status', sa.Enum('in_stock','sold','repair','returned', name='serialstatus'), default='in_stock'),
        sa.Column('sale_id', sa.Integer()),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # STOCK MOVEMENTS
    op.create_table('stock_movements',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('org_id', sa.Integer(), sa.ForeignKey('organizations.id')),
        sa.Column('product_id', sa.Integer(), sa.ForeignKey('products.id')),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('type', sa.Enum('in_stock','out','transfer','writeoff','revision', name='stockmovementtype')),
        sa.Column('reason', sa.Text()),
        sa.Column('supplier', sa.String(255)),
        sa.Column('invoice_number', sa.String(100)),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id')),
        sa.Column('is_deleted', sa.Boolean(), default=False),
        sa.Column('deleted_at', sa.DateTime()),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # SALES
    op.create_table('sales',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('org_id', sa.Integer(), sa.ForeignKey('organizations.id')),
        sa.Column('customer_id', sa.Integer(), sa.ForeignKey('customers.id')),
        sa.Column('seller_id', sa.Integer(), sa.ForeignKey('users.id')),
        sa.Column('total', sa.Numeric(12,2)),
        sa.Column('paid_cash', sa.Numeric(12,2), default=0),
        sa.Column('paid_card', sa.Numeric(12,2), default=0),
        sa.Column('paid_transfer', sa.Numeric(12,2), default=0),
        sa.Column('delivery_type', sa.Enum('none','included','separate', name='deliverytype'), default='none'),
        sa.Column('delivery_price', sa.Numeric(12,2), default=0),
        sa.Column('delivery_address', sa.Text()),
        sa.Column('delivery_date', sa.Date()),
        sa.Column('installation', sa.Boolean(), default=False),
        sa.Column('installation_price', sa.Numeric(12,2), default=0),
        sa.Column('status', sa.Enum('completed','debt','installment','returned', name='salestatus'), default='completed'),
        sa.Column('offline_id', sa.String(36), unique=True),
        sa.Column('synced_at', sa.DateTime()),
        sa.Column('is_deleted', sa.Boolean(), default=False),
        sa.Column('deleted_at', sa.DateTime()),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # SALE ITEMS
    op.create_table('sale_items',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('sale_id', sa.Integer(), sa.ForeignKey('sales.id')),
        sa.Column('product_id', sa.Integer(), sa.ForeignKey('products.id')),
        sa.Column('serial_id', sa.Integer(), sa.ForeignKey('serial_numbers.id')),
        sa.Column('quantity', sa.Integer(), default=1),
        sa.Column('price', sa.Numeric(12,2)),
        sa.Column('discount', sa.Numeric(12,2), default=0),
    )

    # INSTALLMENTS
    op.create_table('installments',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('org_id', sa.Integer(), sa.ForeignKey('organizations.id')),
        sa.Column('sale_id', sa.Integer(), sa.ForeignKey('sales.id')),
        sa.Column('customer_id', sa.Integer(), sa.ForeignKey('customers.id')),
        sa.Column('total_amount', sa.Numeric(12,2)),
        sa.Column('paid_amount', sa.Numeric(12,2), default=0),
        sa.Column('monthly_payment', sa.Numeric(12,2)),
        sa.Column('next_payment_date', sa.Date()),
        sa.Column('status', sa.Enum('active','completed','overdue', name='installmentstatus'), default='active'),
        sa.Column('is_deleted', sa.Boolean(), default=False),
        sa.Column('deleted_at', sa.DateTime()),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # INSTALLMENT PAYMENTS
    op.create_table('installment_payments',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('installment_id', sa.Integer(), sa.ForeignKey('installments.id')),
        sa.Column('amount', sa.Numeric(12,2)),
        sa.Column('payment_method', sa.Enum('cash','card','transfer', name='paymentmethod'), default='cash'),
        sa.Column('paid_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('received_by', sa.Integer(), sa.ForeignKey('users.id')),
    )

    # DELIVERIES
    op.create_table('deliveries',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('org_id', sa.Integer(), sa.ForeignKey('organizations.id')),
        sa.Column('sale_id', sa.Integer(), sa.ForeignKey('sales.id')),
        sa.Column('customer_id', sa.Integer(), sa.ForeignKey('customers.id')),
        sa.Column('address', sa.Text()),
        sa.Column('scheduled_date', sa.Date()),
        sa.Column('scheduled_time', sa.Time()),
        sa.Column('driver_id', sa.Integer(), sa.ForeignKey('users.id')),
        sa.Column('status', sa.Enum('scheduled','in_transit','delivered','failed', name='deliverystatus'), default='scheduled'),
        sa.Column('photo_url', sa.String(500)),
        sa.Column('notes', sa.Text()),
        sa.Column('is_deleted', sa.Boolean(), default=False),
        sa.Column('deleted_at', sa.DateTime()),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # REPAIRS
    op.create_table('repairs',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('org_id', sa.Integer(), sa.ForeignKey('organizations.id')),
        sa.Column('customer_id', sa.Integer(), sa.ForeignKey('customers.id')),
        sa.Column('product_id', sa.Integer(), sa.ForeignKey('products.id')),
        sa.Column('serial_number_text', sa.String(255)),
        sa.Column('description', sa.Text()),
        sa.Column('diagnosis', sa.Text()),
        sa.Column('status', sa.Enum('received','diagnosing','repairing','ready','delivered', name='repairstatus'), default='received'),
        sa.Column('master_id', sa.Integer(), sa.ForeignKey('users.id')),
        sa.Column('parts_cost', sa.Numeric(12,2), default=0),
        sa.Column('labor_cost', sa.Numeric(12,2), default=0),
        sa.Column('received_at', sa.DateTime()),
        sa.Column('ready_at', sa.DateTime()),
        sa.Column('delivered_at', sa.DateTime()),
        sa.Column('is_deleted', sa.Boolean(), default=False),
        sa.Column('deleted_at', sa.DateTime()),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # WARRANTIES
    op.create_table('warranties',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('org_id', sa.Integer(), sa.ForeignKey('organizations.id')),
        sa.Column('sale_id', sa.Integer(), sa.ForeignKey('sales.id')),
        sa.Column('sale_item_id', sa.Integer(), sa.ForeignKey('sale_items.id')),
        sa.Column('product_id', sa.Integer(), sa.ForeignKey('products.id')),
        sa.Column('serial_id', sa.Integer(), sa.ForeignKey('serial_numbers.id')),
        sa.Column('customer_id', sa.Integer(), sa.ForeignKey('customers.id')),
        sa.Column('issued_at', sa.DateTime()),
        sa.Column('expires_at', sa.DateTime()),
        sa.Column('pdf_url', sa.String(500)),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )

def downgrade() -> None:
    op.drop_table('warranties')
    op.drop_table('repairs')
    op.drop_table('deliveries')
    op.drop_table('installment_payments')
    op.drop_table('installments')
    op.drop_table('sale_items')
    op.drop_table('sales')
    op.drop_table('stock_movements')
    op.drop_table('serial_numbers')
    op.drop_table('products')
    op.drop_table('customers')
    op.drop_table('users')
    op.drop_table('organizations')
    op.execute("DROP TYPE IF EXISTS repairstatus")
    op.execute("DROP TYPE IF EXISTS deliverystatus")
    op.execute("DROP TYPE IF EXISTS paymentmethod")
    op.execute("DROP TYPE IF EXISTS installmentstatus")
    op.execute("DROP TYPE IF EXISTS stockmovementtype")
    op.execute("DROP TYPE IF EXISTS serialstatus")
    op.execute("DROP TYPE IF EXISTS salestatus")
    op.execute("DROP TYPE IF EXISTS deliverytype")
    op.execute("DROP TYPE IF EXISTS organizationplan")
    op.execute("DROP TYPE IF EXISTS userrole")
