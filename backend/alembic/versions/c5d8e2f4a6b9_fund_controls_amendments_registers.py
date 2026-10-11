"""fund controls, amendments tracker, registers (modules 4, 6 & 7)

Revision ID: c5d8e2f4a6b9
Revises: b7f3d2c9e4a1
Create Date: 2026-10-11

Module 4 (তহবিল নিয়ন্ত্রণ ও অডিট): income-source columns on
financial_transactions (income_source / income_justification /
is_foreign_funding / government_approval_ref), two-person approval columns
(second_approved_by / second_approved_at / requires_secondary), and the
bank_signatories, audit_reports and welfare_fund_requests tables.

Module 6 (গঠনতন্ত্র সংশোধনী): constitution_versions (append-only) and
amendment_proposals.

Module 7 (রেজিস্টার): society_assets and welfare_activities.

The two-person threshold is intentionally NOT seeded as a FeeSetting row:
services/governance.DEFAULT_EXPENSE_TWO_PERSON_THRESHOLD applies until the
committee saves an explicit value, so existing ledgers keep approving exactly
as before.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "c5d8e2f4a6b9"
down_revision: Union[str, Sequence[str], None] = "b7f3d2c9e4a1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Module 4: fund-control columns on the ledger -----------------------
    op.add_column("financial_transactions", sa.Column("income_source", sa.String(32), nullable=True))
    op.add_column("financial_transactions", sa.Column("income_justification", sa.Text(), nullable=True))
    op.add_column(
        "financial_transactions",
        sa.Column("is_foreign_funding", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "financial_transactions", sa.Column("government_approval_ref", sa.String(128), nullable=True)
    )
    op.add_column(
        "financial_transactions",
        sa.Column(
            "second_approved_by",
            sa.Integer(),
            sa.ForeignKey("admin_users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "financial_transactions",
        sa.Column("second_approved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "financial_transactions",
        sa.Column("requires_secondary", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    # --- Module 4: bank signatories -----------------------------------------
    op.create_table(
        "bank_signatories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("member_id", sa.Integer(), sa.ForeignKey("members.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "committee_term_id",
            sa.Integer(),
            sa.ForeignKey("committee_terms.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("bank_name", sa.String(255), nullable=False),
        sa.Column("branch", sa.String(255), nullable=False),
        sa.Column("account_name", sa.String(255), nullable=False),
        # Only the last 4 digits of the account number are ever stored.
        sa.Column("account_number_masked", sa.String(8), nullable=False),
        sa.Column("authority_scope", sa.Text(), nullable=True),
        sa.Column("valid_from", sa.Date(), nullable=False),
        sa.Column("valid_to", sa.Date(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_bank_signatories_member", "bank_signatories", ["member_id"])

    # --- Module 4: annual audit reports --------------------------------------
    op.create_table(
        "audit_reports",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("fiscal_year", sa.String(8), nullable=False),
        sa.Column("report_date", sa.Date(), nullable=False),
        sa.Column("summary_text", sa.Text(), nullable=True),
        sa.Column("file_path", sa.String(512), nullable=True),
        sa.Column("original_name", sa.String(255), nullable=True),
        sa.Column("published_notice_id", sa.Integer(), sa.ForeignKey("notices.id", ondelete="SET NULL"), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("uploaded_by", sa.Integer(), sa.ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("fiscal_year", name="uq_audit_reports_fiscal_year"),
    )
    op.create_index("ix_audit_reports_fiscal_year", "audit_reports", ["fiscal_year"])

    # --- Module 4: welfare fund requests --------------------------------------
    op.create_table(
        "welfare_fund_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("request_no", sa.String(32), nullable=False),
        sa.Column("member_id", sa.Integer(), sa.ForeignKey("members.id", ondelete="CASCADE"), nullable=False),
        sa.Column("request_type", sa.String(16), nullable=False),
        sa.Column("amount_requested", sa.Numeric(12, 2), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="submitted"),
        sa.Column("committee_reason", sa.Text(), nullable=True),
        sa.Column("approved_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("decided_by", sa.Integer(), sa.ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("disbursed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "transaction_id",
            sa.Integer(),
            sa.ForeignKey("financial_transactions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("request_no", name="uq_welfare_fund_requests_request_no"),
    )
    op.create_index("ix_welfare_fund_requests_status", "welfare_fund_requests", ["status"])
    op.create_index("ix_welfare_fund_requests_member", "welfare_fund_requests", ["member_id"])

    # --- Module 6: constitution versions (append-only) ------------------------
    # amendment_proposals is created FIRST (without its version FKs) so the
    # circular reference can be added via ALTER below - Postgres cannot emit
    # a FK to a table that does not exist yet.
    op.create_table(
        "amendment_proposals",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("proposal_no", sa.String(32), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("rationale", sa.Text(), nullable=False),
        sa.Column("proposed_text", sa.Text(), nullable=False),
        sa.Column("current_version_id", sa.Integer(), nullable=True),
        sa.Column("proposed_by_member_id", sa.Integer(), sa.ForeignKey("members.id", ondelete="SET NULL"), nullable=True),
        sa.Column("proposed_by_admin_id", sa.Integer(), sa.ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="submitted"),
        sa.Column("is_dissolution", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("meeting_id", sa.Integer(), sa.ForeignKey("meetings.id", ondelete="SET NULL"), nullable=True),
        sa.Column("meeting_date", sa.Date(), nullable=True),
        sa.Column("votes_for", sa.Integer(), nullable=True),
        sa.Column("votes_against", sa.Integer(), nullable=True),
        sa.Column("votes_abstain", sa.Integer(), nullable=True),
        sa.Column("required_majority", sa.String(16), nullable=False, server_default="simple"),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decided_by", sa.Integer(), sa.ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("decision_note", sa.Text(), nullable=True),
        sa.Column("adopted_version_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("proposal_no", name="uq_amendment_proposals_proposal_no"),
    )
    op.create_index("ix_amendment_proposals_status", "amendment_proposals", ["status"])

    op.create_table(
        "constitution_versions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("version_no", sa.Integer(), nullable=False),
        sa.Column("full_text", sa.Text(), nullable=False),
        sa.Column("changes_summary", sa.Text(), nullable=True),
        sa.Column("adopted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "source_amendment_id",
            sa.Integer(),
            sa.ForeignKey("amendment_proposals.id", ondelete="SET NULL", use_alter=True, name="fk_constitution_versions_source_amendment"),
            nullable=True,
        ),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("version_no", name="uq_constitution_version_no"),
    )

    # The proposal -> version references complete the cycle via ALTER.
    op.create_foreign_key(
        "fk_amendment_proposals_current_version",
        "amendment_proposals",
        "constitution_versions",
        ["current_version_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_amendment_proposals_adopted_version",
        "amendment_proposals",
        "constitution_versions",
        ["adopted_version_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # --- Module 7: society assets ---------------------------------------------
    op.create_table(
        "society_assets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("asset_code", sa.String(32), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("acquisition_date", sa.Date(), nullable=False),
        sa.Column("value", sa.Numeric(12, 2), nullable=False),
        sa.Column("condition", sa.String(16), nullable=False, server_default="good"),
        sa.Column("location", sa.String(255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("asset_code", name="uq_society_assets_asset_code"),
    )

    # --- Module 7: welfare activities -------------------------------------------
    op.create_table(
        "welfare_activities",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("activity_date", sa.Date(), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("activity_type", sa.String(16), nullable=False, server_default="welfare"),
        sa.Column("participants_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("participant_notes", sa.Text(), nullable=True),
        sa.Column("outcome", sa.Text(), nullable=True),
        sa.Column("organizer", sa.String(255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_welfare_activities_activity_date", "welfare_activities", ["activity_date"])


def downgrade() -> None:
    op.drop_index("ix_welfare_activities_activity_date", table_name="welfare_activities")
    op.drop_table("welfare_activities")
    op.drop_table("society_assets")
    op.drop_constraint("fk_amendment_proposals_current_version", "amendment_proposals", type_="foreignkey")
    op.drop_constraint("fk_amendment_proposals_adopted_version", "amendment_proposals", type_="foreignkey")
    op.drop_index("ix_amendment_proposals_status", table_name="amendment_proposals")
    op.drop_table("amendment_proposals")
    op.drop_table("constitution_versions")
    op.drop_index("ix_welfare_fund_requests_member", table_name="welfare_fund_requests")
    op.drop_index("ix_welfare_fund_requests_status", table_name="welfare_fund_requests")
    op.drop_table("welfare_fund_requests")
    op.drop_index("ix_audit_reports_fiscal_year", table_name="audit_reports")
    op.drop_table("audit_reports")
    op.drop_index("ix_bank_signatories_member", table_name="bank_signatories")
    op.drop_table("bank_signatories")
    op.drop_column("financial_transactions", "requires_secondary")
    op.drop_column("financial_transactions", "second_approved_at")
    op.drop_column("financial_transactions", "second_approved_by")
    op.drop_column("financial_transactions", "government_approval_ref")
    op.drop_column("financial_transactions", "is_foreign_funding")
    op.drop_column("financial_transactions", "income_justification")
    op.drop_column("financial_transactions", "income_source")
