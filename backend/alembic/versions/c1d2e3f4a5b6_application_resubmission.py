"""applicant correction loop: review history + resubmission counters

Additive only. `application_reviews` keeps one row per review decision so a
rejected-then-corrected application keeps its full history; `members` gains
two counters for the resubmission badge and queue ordering.

Revision ID: c1d2e3f4a5b6
Revises: b9d3f7a2c4e6
Create Date: 2026-11-16 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c1d2e3f4a5b6'
down_revision: Union[str, None] = 'b9d3f7a2c4e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'application_reviews',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column(
            'member_id',
            sa.Integer(),
            sa.ForeignKey('members.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column('round', sa.Integer(), nullable=False),
        sa.Column('decision', sa.String(length=16), nullable=False),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('correction_fields', sa.JSON(), nullable=False, server_default='[]'),
        sa.Column(
            'reviewed_by',
            sa.Integer(),
            sa.ForeignKey('admin_users.id', ondelete='SET NULL'),
            nullable=True,
        ),
        sa.Column(
            'created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index('ix_application_reviews_member_id', 'application_reviews', ['member_id'])

    op.add_column(
        'members',
        sa.Column('resubmission_count', sa.Integer(), nullable=False, server_default='0'),
    )
    op.add_column(
        'members', sa.Column('resubmitted_at', sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    op.drop_column('members', 'resubmitted_at')
    op.drop_column('members', 'resubmission_count')
    op.drop_index('ix_application_reviews_member_id', table_name='application_reviews')
    op.drop_table('application_reviews')
