"""app_settings: admin-editable key/value settings (helpline)

Additive and reversible: one new table, no seed row.

Revision ID: e3a7c1b5d9f2
Revises: d2f6b0a4c8e1
Create Date: 2026-10-13 18:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e3a7c1b5d9f2'
down_revision: Union[str, None] = 'd2f6b0a4c8e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'app_settings',
        sa.Column('key', sa.String(length=64), primary_key=True),
        sa.Column('value', sa.JSON(), nullable=False),
        sa.Column('updated_by', sa.Integer(), sa.ForeignKey('admin_users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('app_settings')
