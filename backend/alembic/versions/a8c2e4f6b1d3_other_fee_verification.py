"""other-fee verification columns on fee_payments and picnic_payments

Additive and reversible. Existing rows become 'approved' through the server
default, so totals are unchanged until the pay_verify_other_fees flag is on.

Revision ID: a8c2e4f6b1d3
Revises: f5b8d2a6c1e7
Create Date: 2026-10-14 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a8c2e4f6b1d3'
down_revision: Union[str, None] = 'f5b8d2a6c1e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = ("fee_payments", "picnic_payments")


def upgrade() -> None:
    for table in TABLES:
        with op.batch_alter_table(table) as batch:
            batch.add_column(
                sa.Column("status", sa.String(16), nullable=False, server_default="approved")
            )
            batch.add_column(sa.Column("rejection_reason", sa.String(500), nullable=True))
            batch.add_column(sa.Column("reviewed_by", sa.Integer(), nullable=True))
            batch.add_column(sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True))
            batch.add_column(sa.Column("proof_url", sa.String(512), nullable=True))
            batch.create_foreign_key(
                f"fk_{table}_reviewed_by_admin_users",
                "admin_users",
                ["reviewed_by"],
                ["id"],
                ondelete="SET NULL",
            )
            batch.create_index(f"ix_{table}_status_created_at", ["status", "created_at"])


def downgrade() -> None:
    for table in TABLES:
        with op.batch_alter_table(table) as batch:
            batch.drop_index(f"ix_{table}_status_created_at")
            batch.drop_constraint(f"fk_{table}_reviewed_by_admin_users", type_="foreignkey")
            batch.drop_column("proof_url")
            batch.drop_column("reviewed_at")
            batch.drop_column("reviewed_by")
            batch.drop_column("rejection_reason")
            batch.drop_column("status")
