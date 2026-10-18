"""admin-managed payment accounts replacing hardcoded bank/MFS details

Creates the payment_accounts table, seeds the details that were previously
hardcoded in the frontend (seed rows are idempotent, guarded by NOT-EXISTS on
the identifying number) and adds payment_account_id + payment_account_snapshot
to the tables that record member payments, so history stays correct even after
an account is later edited or deactivated.

Revision ID: b9d3f7a2c4e6
Revises: a8c2e4f6b1d3
Create Date: 2026-10-17 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b9d3f7a2c4e6'
down_revision: Union[str, None] = 'a8c2e4f6b1d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PAYMENT_TABLES = ("installment_payments", "fee_payments", "members")

payment_accounts = sa.table(
    "payment_accounts",
    sa.column("id", sa.Integer),
    sa.column("type", sa.String),
    sa.column("status", sa.String),
    sa.column("display_order", sa.Integer),
    sa.column("label", sa.String),
    sa.column("bank_name", sa.String),
    sa.column("branch_name", sa.String),
    sa.column("account_name", sa.String),
    sa.column("account_number", sa.String),
    sa.column("routing_number", sa.String),
    sa.column("provider", sa.String),
    sa.column("mfs_number", sa.String),
    sa.column("account_kind", sa.String),
    sa.column("instructions", sa.String),
)

# The details that used to live hardcoded in the frontend
# (ORG_BANK_INFO / ORG_MFS_INFO in registration.model.ts). Seeded active so
# the member UI shows no change at launch.
SEED_ACCOUNTS = [
    {
        "type": "bank",
        "status": "active",
        "display_order": 1,
        "label": "ব্র্যাক ব্যাংক - শ্যামপুর",
        "bank_name": "ব্র্যাক ব্যাংক পিএলসি",
        "branch_name": "শ্যামপুর এসএমই/কৃষি শাখা",
        "account_name": "Md Kamrul Hasan",
        "account_number": "1071193760001",
        "routing_number": "060276537",
        "provider": None,
        "mfs_number": None,
        "account_kind": None,
        "instructions": "পেমেন্টের পর ট্রানজেকশন আইডি দিন",
    },
    {
        "type": "mfs",
        "status": "active",
        "display_order": 1,
        "label": "বিকাশ - পার্সোনাল",
        "bank_name": None,
        "branch_name": None,
        "account_name": None,
        "account_number": None,
        "routing_number": None,
        "provider": "bkash",
        "mfs_number": "01758290421",
        "account_kind": "personal",
        "instructions": "পেমেন্টের পর ট্রানজেকশন আইডি দিন",
    },
]


def upgrade() -> None:
    op.create_table(
        "payment_accounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("type", sa.String(8), nullable=False, index=True),
        sa.Column("status", sa.String(8), nullable=False, server_default="active"),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("label", sa.String(120), nullable=False),
        sa.Column("bank_name", sa.String(120), nullable=True),
        sa.Column("branch_name", sa.String(120), nullable=True),
        sa.Column("account_name", sa.String(120), nullable=True),
        sa.Column("account_number", sa.String(32), nullable=True, index=True),
        sa.Column("routing_number", sa.String(9), nullable=True),
        sa.Column("provider", sa.String(16), nullable=True, index=True),
        sa.Column("mfs_number", sa.String(16), nullable=True, index=True),
        sa.Column("account_kind", sa.String(16), nullable=True),
        sa.Column("account_holder", sa.String(120), nullable=True),
        sa.Column("instructions", sa.String(500), nullable=True),
        sa.Column("qr_image_url", sa.String(512), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("updated_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        "ix_payment_accounts_status_type_order",
        "payment_accounts",
        ["status", "type", "display_order"],
    )

    for table in PAYMENT_TABLES:
        with op.batch_alter_table(table) as batch:
            batch.add_column(sa.Column("payment_account_id", sa.Integer(), nullable=True))
            batch.add_column(sa.Column("payment_account_snapshot", sa.String(255), nullable=True))

    conn = op.get_bind()
    for account in SEED_ACCOUNTS:
        identifier_column = "account_number" if account["type"] == "bank" else "mfs_number"
        exists = conn.execute(
            sa.select(payment_accounts.c.id).where(
                payment_accounts.c[identifier_column] == account[identifier_column]
            )
        ).first()
        if exists is None:
            conn.execute(sa.insert(payment_accounts).values(**account))


def downgrade() -> None:
    for table in PAYMENT_TABLES:
        with op.batch_alter_table(table) as batch:
            batch.drop_column("payment_account_snapshot")
            batch.drop_column("payment_account_id")

    op.drop_index("ix_payment_accounts_status_type_order", table_name="payment_accounts")
    op.drop_table("payment_accounts")
