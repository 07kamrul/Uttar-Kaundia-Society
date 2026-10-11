"""allow reusing a rejected installment payment's transaction reference

Revision ID: f1a3c5e7b9d2
Revises: e4b9c1d7a2f3
Create Date: 2026-10-11

uq_installment_payments_method_ref becomes a partial unique index that skips
REJECTED rows: a member whose payment was rejected (e.g. wrong amount) can
resubmit the same real bank / mobile-banking transaction, while a live
(pending or approved) payment still blocks any duplicate.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "f1a3c5e7b9d2"
down_revision: Union[str, Sequence[str], None] = "e4b9c1d7a2f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_INDEX = "uq_installment_payments_method_ref"
_TABLE = "installment_payments"
_NOT_REJECTED = sa.text("status <> 'rejected'")


def upgrade() -> None:
    op.drop_index(_INDEX, table_name=_TABLE)
    op.create_index(
        _INDEX,
        _TABLE,
        ["method", "transaction_ref"],
        unique=True,
        postgresql_where=_NOT_REJECTED,
        sqlite_where=_NOT_REJECTED,
    )


def downgrade() -> None:
    # Fails if a rejected and a live payment now share a reference - resolve
    # those duplicates before downgrading.
    op.drop_index(_INDEX, table_name=_TABLE)
    op.create_index(_INDEX, _TABLE, ["method", "transaction_ref"], unique=True)
