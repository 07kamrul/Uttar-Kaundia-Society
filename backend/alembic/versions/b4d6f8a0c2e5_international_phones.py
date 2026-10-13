"""international phones: *_raw backup columns, E.164 conversion, phone_fix_queue

Additive and reversible:

* adds nullable `*_raw` columns next to every stored phone number;
* converts values that are at least possible phone numbers (region BD when no
  country code) to E.164, copying the original into `*_raw` only when the
  value changes;
* values that cannot be converted (and conversions that would collide with
  another active member's number) are left unchanged and recorded in the new
  `phone_fix_queue` table for an admin to fix;
* per-column counts (converted / already_e164 / queued / empty) are printed
  before and after.

Run `python -m app.services.phone_migration --dry-run` first: it prints the
same counts without writing anything.

The conversion logic is pure Python in app/services/phone_migration.py; this
file uses only core table constructs, no app models.

Revision ID: b4d6f8a0c2e5
Revises: a7c3e9b1d5f2
Create Date: 2026-10-13 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from app.services.phone_migration import PHONE_COLUMNS, apply_conversion, restore_originals


# revision identifiers, used by Alembic.
revision: str = 'b4d6f8a0c2e5'
down_revision: Union[str, None] = 'a7c3e9b1d5f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for spec in PHONE_COLUMNS:
        op.add_column(
            spec.table, sa.Column(spec.raw_column, sa.String(length=64), nullable=True)
        )

    op.create_table(
        'phone_fix_queue',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('entity_type', sa.String(length=32), nullable=False),
        sa.Column('entity_id', sa.Integer(), nullable=False),
        sa.Column('field', sa.String(length=64), nullable=False),
        sa.Column('raw_value', sa.String(length=64), nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('resolved_by_admin_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['resolved_by_admin_id'], ['admin_users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'ix_phone_fix_queue_entity', 'phone_fix_queue', ['entity_type', 'entity_id']
    )

    apply_conversion(op.get_bind(), log=print)


def downgrade() -> None:
    restore_originals(op.get_bind())

    op.drop_index('ix_phone_fix_queue_entity', table_name='phone_fix_queue')
    op.drop_table('phone_fix_queue')
    for spec in reversed(PHONE_COLUMNS):
        op.drop_column(spec.table, spec.raw_column)
