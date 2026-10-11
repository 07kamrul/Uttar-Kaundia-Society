"""Module 4 — তহবিল নিয়ন্ত্রণ ও অডিট (fund controls).

Three control planes over the society fund, all audit-logged:

1. Expense two-person threshold: a versioned FeeSetting
   (services.governance.EXPENSE_TWO_PERSON_THRESHOLD_KEY) with the governance
   default when unset. The approve/secondary-approve workflow itself lives in
   routes/finance.py.
2. Bank signatories: who may operate the account. Only the LAST 4 digits of
   an account number are ever stored or shown.
3. Annual audit reports (July-June fiscal year) with the June reminder window,
   and the সদস্যকল্যাণ তহবিল welfare-request flow — every decision is a human
   committee decision with a mandatory written reason; there is NO
   auto-approval path.
"""

from datetime import date, datetime, timezone
from decimal import Decimal
from html import escape

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.deps import get_current_member
from app.core.permissions import require_member_permission, require_permission
from app.db.session import get_db
from app.models.admin import AdminUser
from app.models.committee_election import CommitteeTerm
from app.models.fee_settings import FeeSetting
from app.models.financial_transaction import FinancialTransaction
from app.models.fund_controls import (
    AuditReport,
    BankSignatory,
    WelfareFundRequest,
    WELFARE_REQUEST_APPROVED,
    WELFARE_REQUEST_DISBURSED,
    WELFARE_REQUEST_REJECTED,
    WELFARE_REQUEST_SUBMITTED,
    WELFARE_REQUEST_UNDER_REVIEW,
)
from app.models.member import Member
from app.services.audit import record_audit
from app.services.email import send_email, send_with_retries
from app.services.governance import (
    COUNCIL_POSTS,
    DEFAULT_EXPENSE_TWO_PERSON_THRESHOLD,
    EXPENSE_TWO_PERSON_THRESHOLD_KEY,
    INCOME_SOURCES,
    WELFARE_REQUEST_TYPES,
    audit_reminder_state,
    fiscal_year_for,
)
from app.services.letters_pdf import render_letter
from app.services.resolution_book import publish_resolution_book_notice
from app.services.storage import save_upload_file

router = APIRouter(tags=["fund-controls"])

settings = get_settings()

_POST_LABELS = {post["key"]: post["bn"] for post in COUNCIL_POSTS}
_TYPE_LABELS = {t["key"]: t["bn"] for t in WELFARE_REQUEST_TYPES}

WF_REQUEST_PREFIX = "KRMF-WF"

OPEN_REQUEST_MESSAGE = (
    "আপনার একটি কল্যাণ তহবিলের আবেদন এখনও চলমান আছে। "
    "একই সময়ে একাধিক আবেদন করা যায় না।"
)

_DECIDED_STATUSES = (WELFARE_REQUEST_APPROVED, WELFARE_REQUEST_REJECTED, WELFARE_REQUEST_DISBURSED)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class FundSettingsOut(BaseModel):
    expense_two_person_threshold: str
    threshold_is_default: bool  # True when no committee-configured version exists
    income_sources: list[dict]


class FundSettingsUpdate(BaseModel):
    expense_two_person_threshold: Decimal = Field(gt=0, max_digits=12, decimal_places=2)


class SignatoryCreate(BaseModel):
    member_id: int
    committee_term_id: int | None = None
    bank_name: str = Field(min_length=1, max_length=255)
    branch: str = Field(min_length=1, max_length=255)
    account_name: str = Field(min_length=1, max_length=255)
    # The FULL number is never accepted: the client sends only the last 4
    # digits, and the server rejects anything longer or non-numeric.
    account_number_last4: str = Field(min_length=4, max_length=4, pattern=r"^\d{4}$")
    authority_scope: str | None = Field(default=None, max_length=2000)
    valid_from: date
    valid_to: date | None = None


class SignatoryUpdate(BaseModel):
    committee_term_id: int | None = None
    bank_name: str | None = Field(default=None, min_length=1, max_length=255)
    branch: str | None = Field(default=None, min_length=1, max_length=255)
    account_name: str | None = Field(default=None, min_length=1, max_length=255)
    account_number_last4: str | None = Field(
        default=None, min_length=4, max_length=4, pattern=r"^\d{4}$"
    )
    authority_scope: str | None = Field(default=None, max_length=2000)
    valid_from: date | None = None
    valid_to: date | None = None
    is_active: bool | None = None


class SignatoryOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    member_id: int
    member_name: str | None = None
    member_display_id: str | None = None
    committee_term_id: int | None = None
    committee_post_bn: str | None = None
    bank_name: str
    branch: str
    account_name: str
    account_number_masked: str
    authority_scope: str | None = None
    valid_from: date
    valid_to: date | None = None
    is_active: bool


class SignatoryDeleteIn(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


class AuditReportOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    fiscal_year: str
    report_date: date
    summary_text: str | None = None
    has_file: bool = False
    original_name: str | None = None
    published_notice_id: int | None = None
    published_at: datetime | None = None
    created_at: datetime


class AuditSummaryUpdate(BaseModel):
    summary_text: str = Field(min_length=1, max_length=20000)


class AuditReminderOut(BaseModel):
    fiscal_year: str
    current_fy_report_exists: bool
    reminder_window_active: bool


class WelfareRequestCreate(BaseModel):
    request_type: str = Field(pattern=r"^(medical|emergency|education|other)$")
    amount_requested: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    reason: str = Field(min_length=1, max_length=5000)


class WelfareRequestOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    request_no: str
    member_id: int
    member_name: str | None = None
    member_display_id: str | None = None
    request_type: str
    amount_requested: Decimal
    reason: str
    status: str
    committee_reason: str | None = None
    approved_amount: Decimal | None = None
    decided_at: datetime | None = None
    disbursed_at: datetime | None = None
    transaction_id: int | None = None
    created_at: datetime

    @field_validator("amount_requested", "approved_amount", mode="before")
    @classmethod
    def _stringify_money(cls, value):
        # Money leaves as a fixed 2-decimal string (JSON floats lose cents).
        return None if value is None else f"{Decimal(str(value)):.2f}"


class WelfareDecisionIn(BaseModel):
    decision: str = Field(pattern=r"^(approved|rejected)$")
    committee_reason: str = Field(min_length=1, max_length=5000)
    approved_amount: Decimal | None = Field(
        default=None, gt=0, max_digits=12, decimal_places=2
    )


class WelfareDisburseIn(BaseModel):
    transaction_id: int | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _money(value: Decimal | str | float) -> str:
    return f"{Decimal(str(value)):.2f}"


def _signatory_out(row: BankSignatory) -> SignatoryOut:
    out = SignatoryOut.model_validate(row)
    if row.member is not None:
        out.member_name = row.member.full_name
        out.member_display_id = row.member.member_id
    if row.committee_term is not None:
        post = _POST_LABELS.get(row.committee_term.post_key, row.committee_term.post_key)
        out.committee_post_bn = post
    return out


async def _load_signatory(db: AsyncSession, signatory_id: int) -> BankSignatory:
    row = (
        await db.execute(select(BankSignatory).where(BankSignatory.id == signatory_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Signatory not found")
    return row


async def _assert_member_and_term(db: AsyncSession, member_id: int, term_id: int | None) -> None:
    if (
        await db.execute(select(Member.id).where(Member.id == member_id))
    ).scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Member {member_id} not found"
        )
    if term_id is not None:
        term = (
            await db.execute(select(CommitteeTerm).where(CommitteeTerm.id == term_id))
        ).scalar_one_or_none()
        if term is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Committee term {term_id} not found",
            )


def _audit_report_out(row: AuditReport) -> AuditReportOut:
    return AuditReportOut(
        id=row.id,
        fiscal_year=row.fiscal_year,
        report_date=row.report_date,
        summary_text=row.summary_text,
        has_file=bool(row.file_path),
        original_name=row.original_name,
        published_notice_id=row.published_notice_id,
        published_at=row.published_at,
        created_at=row.created_at,
    )


def _welfare_out(row: WelfareFundRequest) -> WelfareRequestOut:
    out = WelfareRequestOut.model_validate(row)
    if row.member is not None:
        out.member_name = row.member.full_name
        out.member_display_id = row.member.member_id
    return out


async def _load_welfare_request(db: AsyncSession, request_id: int) -> WelfareFundRequest:
    row = (
        await db.execute(select(WelfareFundRequest).where(WelfareFundRequest.id == request_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Welfare request not found"
        )
    return row


async def _next_welfare_request_no(db: AsyncSession, today: date) -> str:
    prefix = f"{WF_REQUEST_PREFIX}-{today.year}-"
    rows = await db.execute(
        select(WelfareFundRequest.request_no).where(
            WelfareFundRequest.request_no.like(f"{prefix}%")
        )
    )
    max_seq = 0
    for (no,) in rows.all():
        suffix = (no or "")[len(prefix):]
        if suffix.isdigit():
            max_seq = max(max_seq, int(suffix))
    return f"{prefix}{max_seq + 1:04d}"


def _welfare_decision_letter(row: WelfareFundRequest, member: Member) -> bytes:
    approved = row.status in (WELFARE_REQUEST_APPROVED, WELFARE_REQUEST_DISBURSED)
    decision_bn = "অনুমোদিত" if approved else "প্রত্যাখ্যাত"
    amount_lines = [f"আবেদনকৃত অর্থ: {_money(row.amount_requested)} টাকা"]
    if approved and row.approved_amount is not None:
        amount_lines.append(f"অনুমোদিত অর্থ: {_money(row.approved_amount)} টাকা")
    return render_letter(
        title="সদস্যকল্যাণ তহবিল — সিদ্ধান্ত পত্র",
        ref_no=row.request_no,
        body_sections=[
            (
                "আবেদনকারী",
                [
                    f"নাম: {member.full_name}",
                    f"সদস্য নম্বর: {member.member_id or '—'}",
                ],
            ),
            (
                "আবেদনের বিবরণ",
                [
                    f"আবেদন নম্বর: {row.request_no}",
                    f"ধরন: {_TYPE_LABELS.get(row.request_type, row.request_type)}",
                    *amount_lines,
                    f"কারণ: {row.reason}",
                ],
            ),
            (f"কমিটির সিদ্ধান্ত: {decision_bn}", [row.committee_reason or "—"]),
            (
                "দ্রষ্টব্য",
                [
                    "এই সিদ্ধান্ত সোসাইটির কমিটির মানবিক পর্যালোচনার ফল; "
                    "কোনো স্বয়ংক্রিয় ব্যবস্থায় সিদ্ধান্ত গ্রহণ করা হয় না।",
                ],
            ),
        ],
    )


def _decision_email_html(row: WelfareFundRequest, member: Member) -> str:
    approved = row.status in (WELFARE_REQUEST_APPROVED, WELFARE_REQUEST_DISBURSED)
    decision_bn = "অনুমোদিত" if approved else "প্রত্যাখ্যাত"
    amount_line = (
        f"<p>অনুমোদিত অর্থ: {_money(row.approved_amount)} টাকা</p>"
        if approved and row.approved_amount is not None
        else ""
    )
    return (
        f"<p>প্রিয় {escape(member.full_name)},</p>"
        f"<p>আপনার কল্যাণ তহবিলের আবেদন (<strong>{row.request_no}</strong>) "
        f"পর্যালোচিত হয়েছে। সিদ্ধান্ত: <strong>{decision_bn}</strong>।</p>"
        f"<p>{escape(row.committee_reason or '—')}</p>"
        f"{amount_line}"
        "<p>বিস্তারিত সিদ্ধান্ত পত্র সদস্য পোর্টালের 'কল্যাণ তহবিল' পেজে পাওয়া যাবে।</p>"
    )


async def _email_member(member: Member, subject: str, html_body: str) -> bool:
    return await send_with_retries(
        lambda: send_email(
            to=member.email,
            subject=f"{settings.organization_name} - {subject}",
            html_body=html_body,
        )
    )


async def _active_threshold_row(db: AsyncSession) -> FeeSetting | None:
    return (
        await db.execute(
            select(FeeSetting)
            .where(FeeSetting.key == EXPENSE_TWO_PERSON_THRESHOLD_KEY, FeeSetting.status == 1)
            .order_by(FeeSetting.start_date.desc(), FeeSetting.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


# ---------------------------------------------------------------------------
# Settings: two-person threshold (fund.manage)
# ---------------------------------------------------------------------------


@router.get("/admin/fund-controls/settings", response_model=FundSettingsOut)
async def get_fund_settings(
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_permission("fund.manage")),
) -> FundSettingsOut:
    active = await _active_threshold_row(db)
    if active is not None:
        threshold = _money(active.value)
        is_default = False
    else:
        threshold = _money(DEFAULT_EXPENSE_TWO_PERSON_THRESHOLD)
        is_default = True
    return FundSettingsOut(
        expense_two_person_threshold=threshold,
        threshold_is_default=is_default,
        income_sources=list(INCOME_SOURCES),
    )


@router.put("/admin/fund-controls/settings", response_model=FundSettingsOut)
async def update_fund_settings(
    payload: FundSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(require_permission("fund.manage")),
) -> FundSettingsOut:
    """Save a NEW version of the threshold (history is preserved, mirroring
    fee-settings versioning); the previously active version is closed."""
    today = date.today()
    previous = await db.execute(
        select(FeeSetting).where(
            FeeSetting.key == EXPENSE_TWO_PERSON_THRESHOLD_KEY, FeeSetting.status == 1
        )
    )
    had_version = False
    for row in previous.scalars():
        row.end_date = today
        row.status = 0
        had_version = True
    db.add(
        FeeSetting(
            key=EXPENSE_TWO_PERSON_THRESHOLD_KEY,
            value=float(payload.expense_two_person_threshold),
            unit="taka",
            fee_category="governance",
            start_date=today,
            end_date=None,
            status=1,
            created_by=admin.id,
        )
    )
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="fund_controls.settings_update",
        entity_type="fee_setting",
        entity_id=EXPENSE_TWO_PERSON_THRESHOLD_KEY,
        detail=f"expense_two_person_threshold={_money(payload.expense_two_person_threshold)} "
        f"(replaced {'previous version' if had_version else 'governance default'})",
    )
    await db.commit()
    return await get_fund_settings(db, admin)


# ---------------------------------------------------------------------------
# Bank signatories (signatory.manage)
# ---------------------------------------------------------------------------


@router.get("/admin/fund-controls/signatories", response_model=list[SignatoryOut])
async def list_signatories(
    include_inactive: bool = False,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_permission("signatory.manage")),
) -> list[SignatoryOut]:
    query = select(BankSignatory).order_by(
        BankSignatory.is_active.desc(), BankSignatory.valid_from.desc(), BankSignatory.id
    )
    if not include_inactive:
        query = query.where(BankSignatory.is_active == True)  # noqa: E712
    rows = await db.execute(query)
    return [_signatory_out(row) for row in rows.scalars().unique()]


@router.post(
    "/admin/fund-controls/signatories",
    response_model=SignatoryOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_signatory(
    payload: SignatoryCreate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(require_permission("signatory.manage")),
) -> SignatoryOut:
    await _assert_member_and_term(db, payload.member_id, payload.committee_term_id)
    row = BankSignatory(
        member_id=payload.member_id,
        committee_term_id=payload.committee_term_id,
        bank_name=payload.bank_name.strip(),
        branch=payload.branch.strip(),
        account_name=payload.account_name.strip(),
        account_number_masked=payload.account_number_last4,  # last 4 only
        authority_scope=payload.authority_scope,
        valid_from=payload.valid_from,
        valid_to=payload.valid_to,
        created_by=admin.id,
    )
    db.add(row)
    await db.flush()
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="fund_controls.signatory_create",
        entity_type="bank_signatory",
        entity_id=str(row.id),
        detail=f"{row.bank_name} a/c ****{row.account_number_masked} member#{row.member_id}",
    )
    await db.commit()
    await db.refresh(row)
    return _signatory_out(row)


@router.patch("/admin/fund-controls/signatories/{signatory_id}", response_model=SignatoryOut)
async def update_signatory(
    signatory_id: int,
    payload: SignatoryUpdate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(require_permission("signatory.manage")),
) -> SignatoryOut:
    row = await _load_signatory(db, signatory_id)
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")
    if "member_id" in changes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The signatory person cannot be changed; deactivate this record and add a new one.",
        )
    if "committee_term_id" in changes:
        await _assert_member_and_term(db, row.member_id, changes["committee_term_id"])
    before = {field: getattr(row, field) for field in changes}
    for field, value in changes.items():
        setattr(row, field, value)
    diff = "; ".join(f"{field}: {before[field]} → {getattr(row, field)}" for field in sorted(changes))
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="fund_controls.signatory_update",
        entity_type="bank_signatory",
        entity_id=str(row.id),
        detail=diff,
    )
    await db.commit()
    await db.refresh(row)
    return _signatory_out(row)


@router.delete(
    "/admin/fund-controls/signatories/{signatory_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def deactivate_signatory(
    signatory_id: int,
    payload: SignatoryDeleteIn,
    db: AsyncSession = Depends(get_db),
    admin=Depends(require_permission("signatory.manage")),
) -> None:
    """Soft-deactivate with an audit reason; the register keeps its history."""
    row = await _load_signatory(db, signatory_id)
    row.is_active = False
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="fund_controls.signatory_deactivate",
        entity_type="bank_signatory",
        entity_id=str(row.id),
        detail=payload.reason,
    )
    await db.commit()


@router.get("/admin/fund-controls/signatories/bank-letter.pdf")
async def bank_signatory_letter(
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_permission("signatory.manage")),
) -> Response:
    """Letterhead letter listing the authorised signatories (with their
    committee post, where a term is linked) for the bank's files."""
    rows = (
        (
            await db.execute(
                select(BankSignatory)
                .where(BankSignatory.is_active == True)  # noqa: E712
                .order_by(BankSignatory.bank_name, BankSignatory.id)
            )
        )
        .scalars()
        .unique()
        .all()
    )
    paragraphs: list[str] = []
    if not rows:
        paragraphs.append("বর্তমানে কোনো সক্রিয় ব্যাংক স্বাক্ষরকারী নিবন্ধিত নেই।")
    for row in rows:
        member = row.member
        name = member.full_name if member is not None else "—"
        member_no = member.member_id if member is not None else "—"
        post = (
            _POST_LABELS.get(row.committee_term.post_key, "—")
            if row.committee_term is not None
            else "—"
        )
        validity = f"{row.valid_from.isoformat()} হতে"
        if row.valid_to is not None:
            validity += f" {row.valid_to.isoformat()} পর্যন্ত"
        paragraphs.append(
            f"{name} (সদস্য নম্বর: {member_no or '—'}) — পদ: {post}। "
            f"ব্যাংক: {row.bank_name}, শাখা: {row.branch}। "
            f"হিসাবের নাম: {row.account_name}; হিসাব নম্বর: ****{row.account_number_masked}। "
            f"মেয়াদ: {validity}।"
            + (f" ক্ষমতা: {row.authority_scope}" if row.authority_scope else "")
        )
    pdf_bytes = render_letter(
        title="ব্যাংক স্বাক্ষরকারী ব্যক্তিবর্গ চিঠি",
        ref_no=f"KRMF-SIG-{date.today():%Y%m%d}",
        body_sections=[("অনুমোদিত স্বাক্ষরকারীবৃন্দ", paragraphs)],
        meta_line=f"তারিখ: {date.today().isoformat()}",
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="bank-signatories-{date.today():%Y%m%d}.pdf"'
        },
    )


@router.get("/member/fund-controls/signatories", response_model=list[SignatoryOut])
async def member_signatories(
    db: AsyncSession = Depends(get_db),
    _member: Member = Depends(get_current_member),
) -> list[SignatoryOut]:
    """Authenticated read-only view of the ACTIVE signatories."""
    rows = (
        await db.execute(
            select(BankSignatory)
            .where(BankSignatory.is_active == True)  # noqa: E712
            .order_by(BankSignatory.bank_name, BankSignatory.id)
        )
    ).scalars().unique()
    return [_signatory_out(row) for row in rows]


# ---------------------------------------------------------------------------
# Annual audit reports (audit_report.manage) + June reminder
# ---------------------------------------------------------------------------


@router.get("/admin/fund-controls/audit-reminder", response_model=AuditReminderOut)
async def audit_reminder(
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_permission("fund.manage")),
) -> AuditReminderOut:
    """June reminder window: active all through June, and afterwards for as
    long as the fiscal year that already ended has no report (see
    services.governance.audit_reminder_state)."""
    today = date.today()
    # First pass with report_exists=True resolves WHICH fiscal year the
    # reminder is about (the month-6 window never depends on existence).
    reminder_fy = audit_reminder_state(today, report_exists=True)["fiscal_year"]
    fy_report_exists = (
        await db.execute(select(AuditReport.id).where(AuditReport.fiscal_year == reminder_fy))
    ).scalar_one_or_none() is not None
    current_exists = (
        await db.execute(
            select(AuditReport.id).where(AuditReport.fiscal_year == fiscal_year_for(today))
        )
    ).scalar_one_or_none() is not None
    final = audit_reminder_state(today, report_exists=fy_report_exists)
    return AuditReminderOut(
        fiscal_year=final["fiscal_year"],
        current_fy_report_exists=current_exists,
        reminder_window_active=final["reminder_window_active"],
    )


@router.get("/admin/fund-controls/audit-reports", response_model=list[AuditReportOut])
async def list_audit_reports(
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_permission("audit_report.manage")),
) -> list[AuditReportOut]:
    rows = await db.execute(select(AuditReport).order_by(AuditReport.fiscal_year.desc()))
    return [_audit_report_out(row) for row in rows.scalars()]


@router.post(
    "/admin/fund-controls/audit-reports",
    response_model=AuditReportOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_audit_report(
    file: UploadFile = File(...),
    fiscal_year: str = Form(..., pattern=r"^\d{4}-\d{2}$"),
    report_date: date = Form(...),
    summary_text: str | None = Form(default=None),
    db: AsyncSession = Depends(get_db),
    admin=Depends(require_permission("audit_report.manage")),
) -> AuditReportOut:
    """Upload (or replace) the audit report for one fiscal year. One row per
    fiscal year - re-uploading updates the file and metadata, never deletes."""
    existing = (
        await db.execute(select(AuditReport).where(AuditReport.fiscal_year == fiscal_year))
    ).scalar_one_or_none()
    path = await save_upload_file(file, f"audit_reports/fy_{fiscal_year.replace('-', '_')}")
    if existing is None:
        row = AuditReport(
            fiscal_year=fiscal_year,
            report_date=report_date,
            summary_text=(summary_text or "").strip() or None,
            file_path=path,
            original_name=file.filename,
            uploaded_by=admin.id,
        )
        db.add(row)
        await db.flush()
        action = "fund_controls.audit_report_upload"
    else:
        row = existing
        row.report_date = report_date
        if (summary_text or "").strip():
            row.summary_text = summary_text.strip()
        row.file_path = path
        row.original_name = file.filename
        row.uploaded_by = admin.id
        action = "fund_controls.audit_report_replace"
    record_audit(
        db,
        actor_admin_id=admin.id,
        action=action,
        entity_type="audit_report",
        entity_id=str(row.id),
        detail=f"fiscal_year={fiscal_year} file={file.filename}",
    )
    await db.commit()
    await db.refresh(row)
    return _audit_report_out(row)


@router.patch(
    "/admin/fund-controls/audit-reports/{report_id}/summary", response_model=AuditReportOut
)
async def update_audit_summary(
    report_id: int,
    payload: AuditSummaryUpdate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(require_permission("audit_report.manage")),
) -> AuditReportOut:
    row = (
        await db.execute(select(AuditReport).where(AuditReport.id == report_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audit report not found")
    before = row.summary_text
    row.summary_text = payload.summary_text.strip()
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="fund_controls.audit_summary_update",
        entity_type="audit_report",
        entity_id=str(row.id),
        detail=f"summary: {(before or '')[:60]!r} → {row.summary_text[:60]!r}",
    )
    await db.commit()
    await db.refresh(row)
    return _audit_report_out(row)


@router.post(
    "/admin/fund-controls/audit-reports/{report_id}/publish", response_model=AuditReportOut
)
async def publish_audit_report(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    admin=Depends(require_permission("audit_report.manage")),
) -> AuditReportOut:
    """Publish the summary to members through a Notice and link it."""
    row = (
        await db.execute(select(AuditReport).where(AuditReport.id == report_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audit report not found")
    if not (row.summary_text or "").strip():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="প্রকাশের আগে অডিট সারসংক্ষেপ লেখা আবশ্যক।",
        )
    notice = await publish_resolution_book_notice(
        db,
        admin,
        title=f"বার্ষিক অডিট রিপোর্ট প্রকাশিত — অর্থবছর {row.fiscal_year}",
        body=(row.summary_text or "").strip(),
    )
    row.published_notice_id = notice.id
    row.published_at = datetime.now(timezone.utc)
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="fund_controls.audit_report_publish",
        entity_type="audit_report",
        entity_id=str(row.id),
        detail=f"published as notice #{notice.id} for FY {row.fiscal_year}",
    )
    await db.commit()
    await db.refresh(row)
    return _audit_report_out(row)


@router.get("/admin/fund-controls/audit-reports/{report_id}/file")
async def download_audit_report_file(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_permission("audit_report.manage")),
) -> FileResponse:
    row = (
        await db.execute(select(AuditReport).where(AuditReport.id == report_id))
    ).scalar_one_or_none()
    if row is None or not row.file_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No report file")
    path = settings.upload_root / row.file_path
    if not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File missing on disk")
    return FileResponse(path, filename=row.original_name or f"audit-report-{row.fiscal_year}.pdf")


# --- Member: published audit summaries (fund transparency) -----------------


@router.get("/member/fund-controls/audit-reports", response_model=list[AuditReportOut])
async def member_audit_reports(
    db: AsyncSession = Depends(get_db),
    _member: Member = Depends(get_current_member),
) -> list[AuditReportOut]:
    """Only PUBLISHED summaries are member-visible."""
    rows = await db.execute(
        select(AuditReport)
        .where(AuditReport.published_notice_id.is_not(None))
        .order_by(AuditReport.fiscal_year.desc())
    )
    return [_audit_report_out(row) for row in rows.scalars()]


@router.get("/member/fund-controls/audit-reports/{report_id}/file")
async def member_audit_report_file(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    _member: Member = Depends(get_current_member),
) -> FileResponse:
    row = (
        await db.execute(select(AuditReport).where(AuditReport.id == report_id))
    ).scalar_one_or_none()
    if row is None or row.published_notice_id is None or not row.file_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No published report file")
    path = settings.upload_root / row.file_path
    if not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File missing on disk")
    return FileResponse(path, filename=row.original_name or f"audit-report-{row.fiscal_year}.pdf")


# ---------------------------------------------------------------------------
# সদস্যকল্যাণ তহবিল — welfare fund requests
# ---------------------------------------------------------------------------

_welfare_apply = require_member_permission("welfare_fund.apply")


@router.get("/member/welfare-fund/requests", response_model=list[WelfareRequestOut])
async def my_welfare_requests(
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(_welfare_apply),
) -> list[WelfareRequestOut]:
    rows = await db.execute(
        select(WelfareFundRequest)
        .where(WelfareFundRequest.member_id == member.id)
        .order_by(WelfareFundRequest.created_at.desc(), WelfareFundRequest.id.desc())
    )
    return [_welfare_out(row) for row in rows.scalars().unique()]


@router.post(
    "/member/welfare-fund/requests",
    response_model=WelfareRequestOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_welfare_request(
    payload: WelfareRequestCreate,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(_welfare_apply),
) -> WelfareRequestOut:
    # One open request per member at a time - the queue stays fair.
    open_row = (
        await db.execute(
            select(WelfareFundRequest.id)
            .where(
                WelfareFundRequest.member_id == member.id,
                WelfareFundRequest.status.in_(
                    [WELFARE_REQUEST_SUBMITTED, WELFARE_REQUEST_UNDER_REVIEW]
                ),
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if open_row is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=OPEN_REQUEST_MESSAGE)
    row = WelfareFundRequest(
        request_no=await _next_welfare_request_no(db, date.today()),
        member_id=member.id,
        request_type=payload.request_type,
        amount_requested=payload.amount_requested,
        reason=payload.reason.strip(),
        status=WELFARE_REQUEST_SUBMITTED,
    )
    db.add(row)
    await db.flush()
    record_audit(
        db,
        actor_admin_id=None,
        action="welfare_fund.request_create",
        entity_type="welfare_fund_request",
        entity_id=str(row.id),
        detail=f"{row.request_no} member#{member.id} {_money(row.amount_requested)} "
        f"({row.request_type})",
    )
    await db.commit()
    await db.refresh(row)
    return _welfare_out(row)


@router.get("/member/welfare-fund/requests/{request_id}", response_model=WelfareRequestOut)
async def my_welfare_request_detail(
    request_id: int,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(_welfare_apply),
) -> WelfareRequestOut:
    row = await _load_welfare_request(db, request_id)
    if row.member_id != member.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your request")
    return _welfare_out(row)


@router.get("/member/welfare-fund/requests/{request_id}/decision-letter.pdf")
async def my_welfare_decision_letter(
    request_id: int,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(_welfare_apply),
) -> Response:
    row = await _load_welfare_request(db, request_id)
    if row.member_id != member.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your request")
    if row.status not in _DECIDED_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="সিদ্ধান্ত হওয়ার আগে সিদ্ধান্ত পত্র প্রস্তুত নয়।",
        )
    pdf_bytes = _welfare_decision_letter(row, member)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{row.request_no}-decision.pdf"'},
    )


@router.get("/admin/fund-controls/welfare-requests", response_model=list[WelfareRequestOut])
async def list_welfare_requests(
    status_filter: str | None = Query(default=None, alias="status"),
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_permission("welfare_fund.review")),
) -> list[WelfareRequestOut]:
    query = select(WelfareFundRequest).order_by(
        WelfareFundRequest.created_at.desc(), WelfareFundRequest.id.desc()
    )
    if status_filter:
        query = query.where(WelfareFundRequest.status == status_filter)
    rows = await db.execute(query)
    return [_welfare_out(row) for row in rows.scalars().unique()]


@router.post(
    "/admin/fund-controls/welfare-requests/{request_id}/start-review",
    response_model=WelfareRequestOut,
)
async def start_welfare_review(
    request_id: int,
    db: AsyncSession = Depends(get_db),
    admin=Depends(require_permission("welfare_fund.review")),
) -> WelfareRequestOut:
    row = await _load_welfare_request(db, request_id)
    if row.status != WELFARE_REQUEST_SUBMITTED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Only submitted requests can move to review (current: {row.status}).",
        )
    row.status = WELFARE_REQUEST_UNDER_REVIEW
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="welfare_fund.request_review_started",
        entity_type="welfare_fund_request",
        entity_id=str(row.id),
        detail=f"{row.request_no} -> under_review",
    )
    await db.commit()
    await db.refresh(row)
    return _welfare_out(row)


@router.post(
    "/admin/fund-controls/welfare-requests/{request_id}/decide",
    response_model=WelfareRequestOut,
)
async def decide_welfare_request(
    request_id: int,
    payload: WelfareDecisionIn,
    db: AsyncSession = Depends(get_db),
    admin=Depends(require_permission("welfare_fund.review")),
) -> WelfareRequestOut:
    """Committee decision. A written committee_reason is MANDATORY for both
    approve and reject; the approved amount can never exceed the request.
    There is deliberately no auto-approval path anywhere."""
    row = await _load_welfare_request(db, request_id)
    if row.status not in (WELFARE_REQUEST_SUBMITTED, WELFARE_REQUEST_UNDER_REVIEW):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This request is already decided (current: {row.status}).",
        )
    reason = (payload.committee_reason or "").strip()
    if not reason:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="সিদ্ধান্তের কারণ (committee_reason) আবশ্যক।",
        )
    if payload.decision == WELFARE_REQUEST_APPROVED:
        if payload.approved_amount is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="অনুমোদনের সময় অনুমোদিত পরিমাণ (approved_amount) আবশ্যক।",
            )
        if payload.approved_amount > row.amount_requested:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"অনুমোদিত পরিমাণ ({_money(payload.approved_amount)}) আবেদনকৃত পরিমাণ "
                f"({_money(row.amount_requested)})-এর বেশি হতে পারে না।",
            )
        row.approved_amount = payload.approved_amount
        row.status = WELFARE_REQUEST_APPROVED
    else:
        row.approved_amount = None
        row.status = WELFARE_REQUEST_REJECTED
    row.committee_reason = reason
    row.decided_by = admin.id
    row.decided_at = datetime.now(timezone.utc)
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="welfare_fund.request_decided",
        entity_type="welfare_fund_request",
        entity_id=str(row.id),
        detail=f"{row.request_no} -> {row.status}"
        + (f" amount={_money(row.approved_amount)}" if row.approved_amount is not None else "")
        + f"; reason={reason[:120]}",
    )
    await db.commit()
    await db.refresh(row)

    # Decision letter goes out by email too; delivery failures never block
    # the decision (send_with_retries logs them).
    await _email_member(row.member, "কল্যাণ তহবিলের সিদ্ধান্ত", _decision_email_html(row, row.member))
    await db.refresh(row)
    return _welfare_out(row)


@router.post(
    "/admin/fund-controls/welfare-requests/{request_id}/disburse",
    response_model=WelfareRequestOut,
)
async def disburse_welfare_request(
    request_id: int,
    payload: WelfareDisburseIn,
    db: AsyncSession = Depends(get_db),
    admin=Depends(require_permission("welfare_fund.review")),
) -> WelfareRequestOut:
    row = await _load_welfare_request(db, request_id)
    if row.status != WELFARE_REQUEST_APPROVED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Only approved requests can be disbursed (current: {row.status}).",
        )
    if payload.transaction_id is not None:
        txn = (
            await db.execute(
                select(FinancialTransaction).where(
                    FinancialTransaction.id == payload.transaction_id
                )
            )
        ).scalar_one_or_none()
        if txn is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Transaction {payload.transaction_id} does not exist.",
            )
        row.transaction_id = txn.id
    row.status = WELFARE_REQUEST_DISBURSED
    row.disbursed_at = datetime.now(timezone.utc)
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="welfare_fund.request_disbursed",
        entity_type="welfare_fund_request",
        entity_id=str(row.id),
        detail=f"{row.request_no} disbursed"
        + (f" (txn #{row.transaction_id})" if row.transaction_id else ""),
    )
    await db.commit()
    await db.refresh(row)
    return _welfare_out(row)
