"""registration batch 1: abroad address, whatsapp, consent version, dag_unknown

Additive and reversible: new nullable / defaulted columns only.

Revision ID: c1e5a9d3b7f4
Revises: b4d6f8a0c2e5
Create Date: 2026-10-13 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c1e5a9d3b7f4'
down_revision: Union[str, None] = 'b4d6f8a0c2e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('members') as batch:
        batch.add_column(sa.Column('has_whatsapp', sa.Boolean(), nullable=True))
        batch.add_column(
            sa.Column(
                'current_address_abroad', sa.Boolean(), nullable=False, server_default=sa.false()
            )
        )
        batch.add_column(sa.Column('current_country', sa.String(length=2), nullable=True))
        batch.add_column(sa.Column('current_city', sa.String(length=100), nullable=True))
        batch.add_column(sa.Column('current_address_text', sa.String(length=500), nullable=True))
        batch.add_column(sa.Column('consent_version', sa.String(length=16), nullable=True))
    with op.batch_alter_table('properties') as batch:
        batch.add_column(
            sa.Column('dag_unknown', sa.Boolean(), nullable=False, server_default=sa.false())
        )


def downgrade() -> None:
    with op.batch_alter_table('properties') as batch:
        batch.drop_column('dag_unknown')
    with op.batch_alter_table('members') as batch:
        batch.drop_column('consent_version')
        batch.drop_column('current_address_text')
        batch.drop_column('current_city')
        batch.drop_column('current_country')
        batch.drop_column('current_address_abroad')
        batch.drop_column('has_whatsapp')
