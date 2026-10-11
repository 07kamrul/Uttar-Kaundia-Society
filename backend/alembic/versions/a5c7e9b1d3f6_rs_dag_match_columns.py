"""rs dag match columns on plot boundaries

Revision ID: a5c7e9b1d3f6
Revises: c5d8e1a3f7b9
Create Date: 2026-10-11

Stores the RS dag (RAJUK masterplan) a drawn boundary best matches, computed
server-side at submit time, on both the boundary mirror and each version.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "a5c7e9b1d3f6"
down_revision: Union[str, Sequence[str], None] = "c5d8e1a3f7b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for table in ("plot_boundaries", "plot_boundary_versions"):
        op.add_column(table, sa.Column("rs_plot_no", sa.String(64), nullable=True))
        op.add_column(table, sa.Column("rs_match_pct", sa.Numeric(5, 1), nullable=True))
    op.create_index("ix_plot_boundaries_rs_plot_no", "plot_boundaries", ["rs_plot_no"])


def downgrade() -> None:
    op.drop_index("ix_plot_boundaries_rs_plot_no", table_name="plot_boundaries")
    for table in ("plot_boundary_versions", "plot_boundaries"):
        op.drop_column(table, "rs_match_pct")
        op.drop_column(table, "rs_plot_no")
