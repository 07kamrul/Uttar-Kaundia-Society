"""seed maintenance and development fee types

Revision ID: e3f5b7c9d1a4
Revises: d2e4a6b8c0f2
Create Date: 2026-10-11

Adds the maintenance and development fees to the fee_types catalog as
variable "other" fees so they are always selectable on the member Other Fees
page. Existing rows with the same key are left untouched.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "e3f5b7c9d1a4"
down_revision: Union[str, Sequence[str], None] = "d2e4a6b8c0f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SEED_ROWS = [
    {
        "key": "maintenance",
        "label_bn": "রক্ষণাবেক্ষণ ফি",
        "label_en": "Maintenance Fee",
        "sort_order": 3,
    },
    {
        "key": "development",
        "label_bn": "উন্নয়ন ফি",
        "label_en": "Development Fee",
        "sort_order": 4,
    },
]


def upgrade() -> None:
    insert_stmt = sa.text(
        "INSERT INTO fee_types (key, label_bn, label_en, calculation_type, unit,"
        " is_recurring, is_pay_once, fee_category, is_active, sort_order)"
        " VALUES (:key, :label_bn, :label_en, 'variable', 'taka',"
        " false, false, 'other', true, :sort_order)"
        " ON CONFLICT (key) DO NOTHING"
    )
    bind = op.get_bind()
    for row in SEED_ROWS:
        bind.execute(insert_stmt, row)


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        sa.text("DELETE FROM fee_types WHERE key IN ('maintenance', 'development')")
    )
