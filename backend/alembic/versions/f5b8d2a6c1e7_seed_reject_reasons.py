"""seed canned reject reasons as config-list rows

Additive data migration: inserts a row only when (category, value) is missing,
so re-running it (or an admin who already added the same wording) is safe.
Downgrade deletes only these seeded (category, value) pairs.

Revision ID: f5b8d2a6c1e7
Revises: e3a7c1b5d9f2
Create Date: 2026-10-13 19:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f5b8d2a6c1e7'
down_revision: Union[str, None] = 'e3a7c1b5d9f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# category -> reasons (label == value, like the earlier config-list seeds).
REASONS = {
    "reject_reason_payment": [
        "TrxID মিলছে না",
        "টাকার পরিমাণ মিলছে না",
        "স্ক্রিনশট অস্পষ্ট",
        "ডুপ্লিকেট পেমেন্ট",
    ],
    "reject_reason_application": [
        "কাগজপত্র অস্পষ্ট",
        "খতিয়ান/দাগ মিলছে না",
        "ছবি স্পষ্ট নয়",
        "ডুপ্লিকেট আবেদন",
    ],
    "reject_reason_property_request": [
        "কাগজপত্র অস্পষ্ট",
        "তথ্য মিলছে না",
    ],
    "reject_reason_boundary": [
        "সীমানা দাগের সাথে মিলছে না",
        "অন্য সীমানার উপর পড়েছে",
    ],
}

config_list_items = sa.table(
    "config_list_items",
    sa.column("category", sa.String),
    sa.column("value", sa.String),
    sa.column("label", sa.String),
    sa.column("sort_order", sa.Integer),
    sa.column("is_active", sa.SmallInteger),
)


def upgrade() -> None:
    conn = op.get_bind()
    for category, values in REASONS.items():
        for position, value in enumerate(values):
            exists = conn.execute(
                sa.select(sa.literal(1)).select_from(config_list_items).where(
                    config_list_items.c.category == category,
                    config_list_items.c.value == value,
                )
            ).first()
            if exists is None:
                conn.execute(
                    sa.insert(config_list_items).values(
                        category=category, value=value, label=value, sort_order=position, is_active=1
                    )
                )


def downgrade() -> None:
    conn = op.get_bind()
    for category, values in REASONS.items():
        conn.execute(
            sa.delete(config_list_items).where(
                config_list_items.c.category == category,
                config_list_items.c.value.in_(values),
            )
        )
