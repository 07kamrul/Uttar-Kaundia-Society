"""member governance foundation columns

Revision ID: f4a7b9c2e6d8
Revises: e3f5b7c9d1a4
Create Date: 2026-10-11

Adds the governance foundation columns to `members`:
- member_class (nullable string: founder | general | honorary_associate)
- governance_status (NOT NULL, server_default 'active')
- suspension_reason (nullable text)
- suspension_notice_at (nullable timestamp)

These are records only - none of them gate authentication or land-info access.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f4a7b9c2e6d8"
down_revision: Union[str, Sequence[str], None] = "e3f5b7c9d1a4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("members", sa.Column("member_class", sa.String(32), nullable=True))
    op.add_column(
        "members",
        sa.Column(
            "governance_status",
            sa.String(16),
            nullable=False,
            server_default="active",
        ),
    )
    op.add_column("members", sa.Column("suspension_reason", sa.Text(), nullable=True))
    op.add_column("members", sa.Column("suspension_notice_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("members", "suspension_notice_at")
    op.drop_column("members", "suspension_reason")
    op.drop_column("members", "governance_status")
    op.drop_column("members", "member_class")
