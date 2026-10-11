"""add created_at to plot_boundary_versions

Revision ID: d9a4b7c2e1f8
Revises: c7f1a3e9d4b6
Create Date: 2026-10-10

The original plot boundary migration (c7f1a3e9d4b6) shipped without the
`created_at` column that the PlotBoundaryVersion model declares, causing
INSERTs to fail with "column plot_boundary_versions.created_at does not
exist" on databases that had already applied it.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d9a4b7c2e1f8"
down_revision: Union[str, Sequence[str], None] = "c7f1a3e9d4b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_created_at() -> bool:
    columns = sa.inspect(op.get_bind()).get_columns("plot_boundary_versions")
    return any(col["name"] == "created_at" for col in columns)


def upgrade() -> None:
    # c7f1a3e9d4b6 now creates the column itself, so fresh databases already
    # have it; only databases built from the older c7f1a3e9d4b6 need it added.
    if _has_created_at():
        return
    op.add_column(
        "plot_boundary_versions",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("plot_boundary_versions", "created_at")
