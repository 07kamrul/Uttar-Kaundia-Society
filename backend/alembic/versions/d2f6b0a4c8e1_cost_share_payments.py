"""cost_share_payments: member-reported payments toward cost shares

Additive and reversible: one new table.

Revision ID: d2f6b0a4c8e1
Revises: c1e5a9d3b7f4
Create Date: 2026-10-13 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd2f6b0a4c8e1'
down_revision: Union[str, None] = 'c1e5a9d3b7f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'cost_share_payments',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('member_id', sa.Integer(), sa.ForeignKey('members.id', ondelete='CASCADE'), nullable=False),
        sa.Column(
            'share_id', sa.Integer(), sa.ForeignKey('cost_split_shares.id', ondelete='CASCADE'), nullable=False
        ),
        sa.Column('method', sa.String(length=64), nullable=False),
        sa.Column('transaction_ref', sa.String(length=64), nullable=False),
        sa.Column('sender_account', sa.String(length=64), nullable=True),
        sa.Column('amount', sa.Numeric(12, 2), nullable=False),
        sa.Column('paid_on', sa.Date(), nullable=False),
        sa.Column('proof_url', sa.String(length=512), nullable=True),
        sa.Column('note', sa.String(length=500), nullable=True),
        sa.Column('status', sa.String(length=16), nullable=False),
        sa.Column('rejection_reason', sa.String(length=500), nullable=True),
        sa.Column('reviewed_by', sa.Integer(), sa.ForeignKey('admin_users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_cost_share_payments_member_id', 'cost_share_payments', ['member_id'])
    op.create_index('ix_cost_share_payments_share_id', 'cost_share_payments', ['share_id'])
    op.create_index('ix_cost_share_payments_status_created', 'cost_share_payments', ['status', 'created_at'])
    op.create_index(
        'uq_cost_share_payments_share_method_ref',
        'cost_share_payments',
        ['share_id', 'method', 'transaction_ref'],
        unique=True,
        postgresql_where=sa.text("status <> 'rejected'"),
        sqlite_where=sa.text("status <> 'rejected'"),
    )


def downgrade() -> None:
    op.drop_index('uq_cost_share_payments_share_method_ref', table_name='cost_share_payments')
    op.drop_index('ix_cost_share_payments_status_created', table_name='cost_share_payments')
    op.drop_index('ix_cost_share_payments_share_id', table_name='cost_share_payments')
    op.drop_index('ix_cost_share_payments_member_id', table_name='cost_share_payments')
    op.drop_table('cost_share_payments')
