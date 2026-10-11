"""committee registry, elections, meetings/quorum, petitions (modules 2 & 3)

Revision ID: b7f3d2c9e4a1
Revises: a5c7e9b1d3f6
Create Date: 2026-10-11

Creates the committee/election tables (committee_terms, post_vacancies,
elections, nominations, voter_snapshots, votes, election_complaints), the
special-session petitions and open-vote choices, and extends meetings/
resolutions with council type, notice/quorum bookkeeping and vote mode /
casting vote columns. Existing rows survive: new meeting/resolution columns
are nullable or carry server defaults.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "b7f3d2c9e4a1"
down_revision: Union[str, Sequence[str], None] = "a5c7e9b1d3f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "committee_terms",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("post_key", sa.String(64), nullable=False),
        sa.Column("member_id", sa.Integer(), sa.ForeignKey("members.id", ondelete="SET NULL"), nullable=True),
        sa.Column("term_start", sa.Date(), nullable=False),
        sa.Column("term_end", sa.Date(), nullable=False),
        sa.Column("is_caretaker", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("replaced_by_term_id", sa.Integer(), sa.ForeignKey("committee_terms.id", ondelete="SET NULL"), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_committee_terms_post_status", "committee_terms", ["post_key", "term_end"])

    op.create_table(
        "post_vacancies",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("post_key", sa.String(64), nullable=False),
        sa.Column("term_id", sa.Integer(), sa.ForeignKey("committee_terms.id", ondelete="SET NULL"), nullable=True),
        sa.Column("member_id", sa.Integer(), sa.ForeignKey("members.id", ondelete="CASCADE"), nullable=False),
        sa.Column("vacancy_type", sa.String(16), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("investigation_note", sa.Text(), nullable=True),
        sa.Column("response_deadline", sa.Date(), nullable=True),
        sa.Column("member_response", sa.Text(), nullable=True),
        sa.Column("member_responded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decision", sa.String(16), nullable=True),
        sa.Column("decision_note", sa.Text(), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("acknowledged_by", sa.Integer(), sa.ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_post_vacancies_post_status", "post_vacancies", ["post_key", "status"])

    op.create_table(
        "elections",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("nomination_start", sa.Date(), nullable=False),
        sa.Column("nomination_end", sa.Date(), nullable=False),
        sa.Column("voting_start", sa.Date(), nullable=False),
        sa.Column("voting_end", sa.Date(), nullable=False),
        sa.Column("status", sa.String(24), nullable=False, server_default="draft"),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "nominations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("election_id", sa.Integer(), sa.ForeignKey("elections.id", ondelete="CASCADE"), nullable=False),
        sa.Column("post_key", sa.String(64), nullable=False),
        sa.Column("member_id", sa.Integer(), sa.ForeignKey("members.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("statement", sa.Text(), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decided_by", sa.Integer(), sa.ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("election_id", "post_key", "member_id", name="uq_nomination_member_post"),
    )
    op.create_index("ix_nominations_election_status", "nominations", ["election_id", "status"])

    op.create_table(
        "voter_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("election_id", sa.Integer(), sa.ForeignKey("elections.id", ondelete="CASCADE"), nullable=False),
        sa.Column("member_id", sa.Integer(), sa.ForeignKey("members.id", ondelete="CASCADE"), nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("election_id", "member_id", name="uq_voter_snapshot_member"),
    )

    op.create_table(
        "votes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("election_id", sa.Integer(), sa.ForeignKey("elections.id", ondelete="CASCADE"), nullable=False),
        sa.Column("post_key", sa.String(64), nullable=False),
        sa.Column("voter_member_id", sa.Integer(), sa.ForeignKey("members.id", ondelete="CASCADE"), nullable=False),
        sa.Column("candidate_nomination_id", sa.Integer(), sa.ForeignKey("nominations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("cast_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("election_id", "post_key", "voter_member_id", name="uq_vote_one_per_post"),
    )
    op.create_index("ix_votes_election_post", "votes", ["election_id", "post_key"])

    op.create_table(
        "election_complaints",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("election_id", sa.Integer(), sa.ForeignKey("elections.id", ondelete="CASCADE"), nullable=False),
        sa.Column("complainant_member_id", sa.Integer(), sa.ForeignKey("members.id", ondelete="CASCADE"), nullable=False),
        sa.Column("against", sa.String(255), nullable=True),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.Column("details", sa.Text(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="submitted"),
        sa.Column("resolution", sa.Text(), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decided_by", sa.Integer(), sa.ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "ix_election_complaints_election_status", "election_complaints", ["election_id", "status"]
    )

    op.create_table(
        "open_vote_choices",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("resolution_id", sa.Integer(), sa.ForeignKey("resolutions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("member_id", sa.Integer(), sa.ForeignKey("members.id", ondelete="CASCADE"), nullable=False),
        sa.Column("choice", sa.String(8), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("uq_open_vote_choice", "open_vote_choices", ["resolution_id", "member_id"], unique=True)

    op.create_table(
        "special_session_petitions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("petition_no", sa.String(32), nullable=False, unique=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("justification", sa.Text(), nullable=False),
        sa.Column("submitted_by_member_id", sa.Integer(), sa.ForeignKey("members.id", ondelete="CASCADE"), nullable=False),
        sa.Column("signatures", sa.JSON(), nullable=False),
        sa.Column("signature_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("required_count", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="submitted"),
        sa.Column("response_due", sa.Date(), nullable=True),
        sa.Column("committee_response", sa.Text(), nullable=True),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("meeting_id", sa.Integer(), sa.ForeignKey("meetings.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_by_admin", sa.Integer(), sa.ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.add_column(
        "meetings",
        sa.Column("council_type", sa.String(16), nullable=False, server_default="executive"),
    )
    op.add_column("meetings", sa.Column("notice_published_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("meetings", sa.Column("scheduled_start_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("meetings", sa.Column("quorum_present", sa.Integer(), nullable=True))
    op.add_column("meetings", sa.Column("quorum_required", sa.Integer(), nullable=True))
    op.add_column(
        "meetings", sa.Column("quorum_acknowledged", sa.Boolean(), nullable=False, server_default=sa.text("0"))
    )
    op.add_column(
        "meetings", sa.Column("casting_vote_used", sa.Boolean(), nullable=False, server_default=sa.text("0"))
    )

    op.add_column("resolutions", sa.Column("vote_mode", sa.String(8), nullable=True))
    op.add_column("resolutions", sa.Column("casting_vote", sa.String(8), nullable=True))
    op.add_column("resolutions", sa.Column("casting_note", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("resolutions", "casting_note")
    op.drop_column("resolutions", "casting_vote")
    op.drop_column("resolutions", "vote_mode")
    for column in (
        "casting_vote_used",
        "quorum_acknowledged",
        "quorum_required",
        "quorum_present",
        "scheduled_start_at",
        "notice_published_at",
        "council_type",
    ):
        op.drop_column("meetings", column)
    op.drop_table("special_session_petitions")
    op.drop_index("uq_open_vote_choice", table_name="open_vote_choices")
    op.drop_table("open_vote_choices")
    op.drop_index("ix_election_complaints_election_status", table_name="election_complaints")
    op.drop_table("election_complaints")
    op.drop_index("ix_votes_election_post", table_name="votes")
    op.drop_table("votes")
    op.drop_table("voter_snapshots")
    op.drop_index("ix_nominations_election_status", table_name="nominations")
    op.drop_table("nominations")
    op.drop_table("elections")
    op.drop_index("ix_post_vacancies_post_status", table_name="post_vacancies")
    op.drop_table("post_vacancies")
    op.drop_index("ix_committee_terms_post_status", table_name="committee_terms")
    op.drop_table("committee_terms")
