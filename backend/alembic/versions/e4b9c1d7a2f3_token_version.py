"""add token_version to admin_users and member_credentials

Revision ID: e4b9c1d7a2f3
Revises: c5d8e2f4a6b9
Create Date: 2026-10-11

Per-account revocation counter embedded as the `ver` JWT claim; bumping it
(password reset/change) invalidates every previously issued token.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "e4b9c1d7a2f3"
down_revision: Union[str, Sequence[str], None] = "c5d8e2f4a6b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = ("admin_users", "member_credentials")


def _has_column(table: str) -> bool:
    columns = sa.inspect(op.get_bind()).get_columns(table)
    return any(col["name"] == "token_version" for col in columns)


def upgrade() -> None:
    for table in TABLES:
        if _has_column(table):
            continue
        op.add_column(
            table,
            sa.Column("token_version", sa.Integer(), server_default="0", nullable=False),
        )


def downgrade() -> None:
    for table in TABLES:
        if _has_column(table):
            with op.batch_alter_table(table) as batch:
                batch.drop_column("token_version")
