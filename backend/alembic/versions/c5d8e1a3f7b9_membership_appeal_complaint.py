"""membership appeal + complaint modules

Revision ID: c5d8e1a3f7b9
Revises: f4a7b9c2e6d8
Create Date: 2026-10-11

Module 1 (সদস্য আবেদন ও আপিল) and Module 5 (অভিযোগ ব্যবস্থা) tables:
- membership_applications
- fee_waivers
- membership_actions
- membership_appeals
- complaints
- data_correction_requests
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c5d8e1a3f7b9"
down_revision: Union[str, Sequence[str], None] = "f4a7b9c2e6d8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "membership_applications",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("application_no", sa.String(32), nullable=False, unique=True),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("father_name", sa.String(255), nullable=False),
        sa.Column("mother_name", sa.String(255), nullable=False),
        sa.Column("spouse_name", sa.String(255), nullable=True),
        sa.Column("mobile", sa.String(32), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("address_house", sa.String(255), nullable=True),
        sa.Column("address_road", sa.String(255), nullable=True),
        sa.Column("address_post_office", sa.String(255), nullable=True),
        sa.Column("address_upazila", sa.String(255), nullable=True),
        sa.Column("address_district", sa.String(255), nullable=True),
        sa.Column("address_division", sa.String(255), nullable=True),
        sa.Column("ownership_type", sa.String(32), nullable=False),
        sa.Column("nid_document_path", sa.String(512), nullable=True),
        sa.Column("ownership_document_path", sa.String(512), nullable=True),
        sa.Column("consent", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("member_id", sa.Integer(), sa.ForeignKey("members.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(24), nullable=False, server_default="received", index=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("sla_due_at", sa.Date(), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_by_admin_id", sa.Integer(), sa.ForeignKey("admin_users.id"), nullable=True),
        sa.Column("notification_status", sa.String(16), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "fee_waivers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("member_id", sa.Integer(), sa.ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("type", sa.String(16), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("months", sa.Integer(), nullable=True),
        sa.Column("installment_plan", sa.Text(), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending", index=True),
        sa.Column("decided_by_admin_id", sa.Integer(), sa.ForeignKey("admin_users.id"), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decision_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "membership_actions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("member_id", sa.Integer(), sa.ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("type", sa.String(16), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("written_notice_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("response_deadline", sa.Date(), nullable=True),
        sa.Column("member_response", sa.Text(), nullable=True),
        sa.Column("member_response_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(24), nullable=False, server_default="draft", index=True),
        sa.Column("decision", sa.Text(), nullable=True),
        sa.Column("decided_by_admin_id", sa.Integer(), sa.ForeignKey("admin_users.id"), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notification_email_sent", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "membership_appeals",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("membership_action_id", sa.Integer(), sa.ForeignKey("membership_actions.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("application_id", sa.Integer(), sa.ForeignKey("membership_applications.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("filed_by_member_id", sa.Integer(), sa.ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("grounds", sa.Text(), nullable=False),
        sa.Column("filed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("window_expires_at", sa.Date(), nullable=False),
        sa.Column("assigned_reviewer_admin_id", sa.Integer(), sa.ForeignKey("admin_users.id"), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="submitted", index=True),
        sa.Column("decision", sa.Text(), nullable=True),
        sa.Column("decided_by_admin_id", sa.Integer(), sa.ForeignKey("admin_users.id"), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notification_status", sa.String(16), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "complaints",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("complaint_no", sa.String(32), nullable=False, unique=True),
        sa.Column("complainant_member_id", sa.Integer(), sa.ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.Column("details", sa.Text(), nullable=False),
        sa.Column("is_land_protection", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("form_data", sa.Text(), nullable=True),
        sa.Column("evidence_path", sa.String(512), nullable=True),
        sa.Column("evidence_name", sa.String(255), nullable=True),
        sa.Column("accused_admin_id", sa.Integer(), sa.ForeignKey("admin_users.id"), nullable=True),
        sa.Column("assigned_admin_id", sa.Integer(), sa.ForeignKey("admin_users.id"), nullable=True),
        sa.Column("status", sa.String(24), nullable=False, server_default="submitted"),
        sa.Column("submitted_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("sla_ack_due", sa.Date(), nullable=False),
        sa.Column("sla_update_due", sa.Date(), nullable=False),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("first_update_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolution_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_complaints_status", "complaints", ["status"])
    op.create_index("ix_complaints_complainant", "complaints", ["complainant_member_id"])
    op.create_table(
        "data_correction_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("member_id", sa.Integer(), sa.ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("field", sa.String(64), nullable=False),
        sa.Column("requested_value", sa.String(500), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending", index=True),
        sa.Column("admin_note", sa.Text(), nullable=True),
        sa.Column("handled_by_admin_id", sa.Integer(), sa.ForeignKey("admin_users.id"), nullable=True),
        sa.Column("handled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("data_correction_requests")
    op.drop_index("ix_complaints_complainant", table_name="complaints")
    op.drop_index("ix_complaints_status", table_name="complaints")
    op.drop_table("complaints")
    op.drop_table("membership_appeals")
    op.drop_table("membership_actions")
    op.drop_table("fee_waivers")
    op.drop_table("membership_applications")
