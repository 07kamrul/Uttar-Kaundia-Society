"""Module 1 — সদস্য আবেদন ও আপিল (membership applications, fee waivers,
suspension/termination workflow and appeals).

Public registration keeps using the existing submissions flow; this module
adds the review workflow on top (MembershipApplication), the written-notice
suspension/termination workflow (MembershipAction), committee-decided fee
waivers (FeeWaiver) and appeals (MembershipAppeal) with the constitutional
30-day window and the reviewer != original decision-maker rule.
"""

import json
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.deps import get_current_admin, get_current_member
from app.core.permissions import is_super_admin, require_permission
from app.db.session import get_db
from app.models.admin import AdminUser
from app.models.audit_log import AuditLog
from app.models.complaint import CORRECTION_STATUSES, CORRECTION_STATUS_APPLIED, CORRECTION_STATUS_PENDING, CORRECTION_STATUS_REJECTED, DataCorrectionRequest
from app.models.fee_payment import FeePayment
from app.models.membership_appeal import FeeWaiver
from app.models.fee_settings import FeeSetting
from app.models.member import (
    GOVERNANCE_STATUS_ACTIVE,
    GOVERNANCE_STATUS_SUSPENDED,
    MEMBER_CLASSES,
    MEMBER_CLASS_GENERAL,
    Member,
    MemberStatus,
)
from app.models.membership_appeal import (
    ACTION_STATUSES,
    ACTION_STATUS_AWAITING_RESPONSE,
    ACTION_STATUS_CANCELLED,
    ACTION_STATUS_DECIDED,
    ACTION_STATUS_DRAFT,
    ACTION_STATUS_NOTICED,
    ACTION_TYPES,
    ACTION_TYPE_SUSPEND,
    ACTION_TYPE_TERMINATE,
    APPEAL_STATUSES,
    APPEAL_STATUS_DECIDED_STATES,
    APPEAL_STATUS_OVERTURNED,
    APPEAL_STATUS_SUBMITTED,
    APPEAL_STATUS_UNDER_REVIEW,
    APPEAL_STATUS_UPHELD,
    APPLICATION_STATUSES,
    APP_STATUS_APPROVED,
    APP_STATUS_RECEIVED,
    APP_STATUS_REJECTED,
    APP_STATUS_UNDER_REVIEW,
    MembershipAction,
    MembershipApplication,
    MembershipAppeal,
    OWNERSHIP_TYPES,
    WAIVER_STATUSES,
    WAIVER_STATUS_APPROVED,
    WAIVER_STATUS_PENDING,
    WAIVER_STATUS_REJECTED,
    WAIVER_TYPES,
)
from app.schemas.common import validate_required_phone
from app.services.audit import record_audit
from app.services.dag_guard import ensure_dag_filled
from app.services.email import send_email, send_with_retries
from app.services.governance import (
    APPEAL_WINDOW_DAYS,
    MEMBERSHIP_SLA_WORKING_DAYS,
    add_working_days,
    sla_status,
)
from app.services.letters_pdf import render_letter
from app.services.storage import save_upload_file

settings = get_settings()

router = APIRouter(tags=["membership-appeal"])

ORG_NAME = "উত্তর কাউন্দিয়া আবাসন মালিক কল্যাণ সোসাইটি"
RESPONSE_WINDOW_WORKING_DAYS = 15

_APP_NO_PREFIX = "KRMF-SD"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _today() -> date:
    return _now().date()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class ApplicationCreate(BaseModel):
    full_name: str
    father_name: str
    mother_name: str
    spouse_name: str | None = None
    mobile: str
    email: str
    address_house: str | None = None
    address_road: str | None = None
    address_post_office: str | None = None
    address_upazila: str | None = None
    address_district: str | None = None
    address_division: str | None = None
    ownership_type: str
    consent: bool

    _validate_mobile = field_validator("mobile")(validate_required_phone)

    @field_validator("consent")
    @classmethod
    def _consent_required(cls, value: bool) -> bool:
        if not value:
            raise ValueError("Consent is required to submit an application")
        return value

    @field_validator("ownership_type")
    @classmethod
    def _valid_ownership(cls, value: str) -> str:
        if value not in OWNERSHIP_TYPES:
            raise ValueError(f"ownership_type must be one of: {', '.join(OWNERSHIP_TYPES)}")
        return value


class TimelineEvent(BaseModel):
    event: str
    at: datetime
    actor: str | None = None
    note: str | None = None


class ApplicationOut(BaseModel):
    id: int
    application_no: str
    full_name: str
    father_name: str
    mother_name: str
    spouse_name: str | None = None
    mobile: str
    email: str
    address_house: str | None = None
    address_road: str | None = None
    address_post_office: str | None = None
    address_upazila: str | None = None
    address_district: str | None = None
    address_division: str | None = None
    ownership_type: str
    has_nid_document: bool
    has_ownership_document: bool
    consent: bool
    status: str
    rejection_reason: str | None = None
    submitted_at: datetime
    sla_due_at: date
    sla: dict
    reviewed_at: datetime | None = None
    notification_status: str | None = None
    member_id: int | None = None
    timeline: list[TimelineEvent] = []


class ApplicationApprove(BaseModel):
    member_id: int | None = None
    member_class: str = MEMBER_CLASS_GENERAL

    @field_validator("member_class")
    @classmethod
    def _valid_class(cls, value: str) -> str:
        if value not in MEMBER_CLASSES:
            raise ValueError(f"member_class must be one of: {', '.join(MEMBER_CLASSES)}")
        return value


class RejectPayload(BaseModel):
    reason: str


class WaiverCreate(BaseModel):
    type: str
    reason: str
    months: int | None = None
    installment_plan: list[dict[str, Any]] | None = None

    @field_validator("type")
    @classmethod
    def _valid_type(cls, value: str) -> str:
        if value not in WAIVER_TYPES:
            raise ValueError(f"type must be one of: {', '.join(WAIVER_TYPES)}")
        return value


class WaiverOut(BaseModel):
    id: int
    member_id: int
    member_name: str | None = None
    type: str
    reason: str
    months: int | None = None
    installment_plan: list[dict[str, Any]] | None = None
    status: str
    decision_note: str | None = None
    decided_at: datetime | None = None
    created_at: datetime | None = None


class WaiverDecision(BaseModel):
    status: str
    note: str | None = None

    @field_validator("status")
    @classmethod
    def _valid_status(cls, value: str) -> str:
        if value not in (WAIVER_STATUS_APPROVED, WAIVER_STATUS_REJECTED):
            raise ValueError("status must be approved or rejected")
        return value


class ActionCreate(BaseModel):
    member_id: int
    type: str
    reason: str

    @field_validator("type")
    @classmethod
    def _valid_type(cls, value: str) -> str:
        if value not in ACTION_TYPES:
            raise ValueError(f"type must be one of: {', '.join(ACTION_TYPES)}")
        return value


class ActionOut(BaseModel):
    id: int
    member_id: int
    member_name: str | None = None
    type: str
    reason: str
    written_notice_at: datetime | None = None
    response_deadline: date | None = None
    member_response: str | None = None
    member_response_at: datetime | None = None
    status: str
    decision: str | None = None
    decided_at: datetime | None = None
    notification_email_sent: bool | None = None


class ActionNotice(BaseModel):
    note: str | None = None


class ActionDecide(BaseModel):
    decision: str
    confirm_action: bool = False


class MemberResponse(BaseModel):
    response: str


class AppealCreate(BaseModel):
    membership_action_id: int | None = None
    application_id: int | None = None
    grounds: str


class AppealOut(BaseModel):
    id: int
    membership_action_id: int | None = None
    application_id: int | None = None
    filed_by_member_id: int
    grounds: str
    filed_at: datetime
    window_expires_at: date
    assigned_reviewer_admin_id: int | None = None
    reviewer_name: str | None = None
    status: str
    decision: str | None = None
    decided_at: datetime | None = None


class AppealAssign(BaseModel):
    reviewer_admin_id: int


class AppealDecision(BaseModel):
    status: str
    decision: str

    @field_validator("status")
    @classmethod
    def _valid_status(cls, value: str) -> str:
        if value not in (APPEAL_STATUS_UPHELD, APPEAL_STATUS_OVERTURNED):
            raise ValueError("status must be upheld or overturned")
        return value


class CorrectionCreate(BaseModel):
    field: str
    requested_value: str
    reason: str


class CorrectionOut(BaseModel):
    id: int
    member_id: int
    member_name: str | None = None
    field: str
    requested_value: str
    reason: str
    status: str
    admin_note: str | None = None
    handled_at: datetime | None = None
    created_at: datetime | None = None


class CorrectionDecision(BaseModel):
    status: str
    admin_note: str | None = None

    @field_validator("status")
    @classmethod
    def _valid_status(cls, value: str) -> str:
        if value not in (CORRECTION_STATUS_APPLIED, CORRECTION_STATUS_REJECTED):
            raise ValueError("status must be applied or rejected")
        return value


class SuspensionNoticePayload(BaseModel):
    reason: str


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


async def _next_application_no(db: AsyncSession) -> str:
    year = _today().year
    count = await db.scalar(
        select(func.count(MembershipApplication.id)).where(
            MembershipApplication.application_no.like(f"{_APP_NO_PREFIX}-{year}-%")
        )
    )
    return f"{_APP_NO_PREFIX}-{year}-{(count or 0) + 1:04d}"


def _app_sla(application: MembershipApplication) -> dict:
    return sla_status(due=application.sla_due_at, acknowledged=application.reviewed_at)


def _application_timeline(
    application: MembershipApplication, actor_names: dict[int, str]
) -> list[TimelineEvent]:
    events: list[TimelineEvent] = [
        TimelineEvent(event="submitted", at=application.submitted_at, actor=application.full_name)
    ]
    for row in application.audit_rows:
        note = None
        if row.detail:
            try:
                note = json.loads(row.detail).get("note")
            except (ValueError, TypeError):
                note = row.detail
        events.append(
            TimelineEvent(
                event=row.action,
                at=row.created_at,
                actor=actor_names.get(row.actor_admin_id),
                note=note,
            )
        )
    if application.reviewed_at:
        events.append(
            TimelineEvent(
                event=f"reviewed_{application.status}",
                at=application.reviewed_at,
                actor=actor_names.get(application.reviewed_by_admin_id),
                note=application.rejection_reason,
            )
        )
    return events


async def _actor_names(
    db: AsyncSession, admin_ids: set[int | None]
) -> dict[int | None, str]:
    ids = {i for i in admin_ids if i is not None}
    if not ids:
        return {}
    rows = await db.execute(select(AdminUser.id, AdminUser.name).where(AdminUser.id.in_(ids)))
    return {row_id: name for row_id, name in rows.all()}


def _application_out(
    application: MembershipApplication,
    timeline: list[TimelineEvent],
) -> ApplicationOut:
    return ApplicationOut(
        id=application.id,
        application_no=application.application_no,
        full_name=application.full_name,
        father_name=application.father_name,
        mother_name=application.mother_name,
        spouse_name=application.spouse_name,
        mobile=application.mobile,
        email=application.email,
        address_house=application.address_house,
        address_road=application.address_road,
        address_post_office=application.address_post_office,
        address_upazila=application.address_upazila,
        address_district=application.address_district,
        address_division=application.address_division,
        ownership_type=application.ownership_type,
        has_nid_document=bool(application.nid_document_path),
        has_ownership_document=bool(application.ownership_document_path),
        consent=application.consent,
        status=application.status,
        rejection_reason=application.rejection_reason,
        submitted_at=application.submitted_at,
        sla_due_at=application.sla_due_at,
        sla=_app_sla(application),
        reviewed_at=application.reviewed_at,
        notification_status=application.notification_status,
        member_id=application.member_id,
        timeline=timeline,
    )


async def _load_application(db: AsyncSession, application_id: int) -> MembershipApplication:
    application = (
        await db.execute(
            select(MembershipApplication).where(MembershipApplication.id == application_id)
        )
    ).scalar_one_or_none()
    if application is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    return application


async def _application_detail(
    db: AsyncSession, application: MembershipApplication
) -> ApplicationOut:
    rows = (
        await db.execute(
            select(AuditLog)
            .where(
                AuditLog.entity_type == "membership_application",
                AuditLog.entity_id == str(application.id),
            )
            .order_by(AuditLog.created_at)
        )
    ).scalars().all()
    application.audit_rows = list(rows)  # type: ignore[attr-defined]
    names = await _actor_names(
        db, {row.actor_admin_id for row in rows} | {application.reviewed_by_admin_id}
    )
    return _application_out(application, _application_timeline(application, names))


def _waiver_out(waiver: FeeWaiver, member_name: str | None = None) -> WaiverOut:
    plan = None
    if waiver.installment_plan:
        try:
            plan = json.loads(waiver.installment_plan)
        except ValueError:
            plan = None
    return WaiverOut(
        id=waiver.id,
        member_id=waiver.member_id,
        member_name=member_name,
        type=waiver.type,
        reason=waiver.reason,
        months=waiver.months,
        installment_plan=plan,
        status=waiver.status,
        decision_note=waiver.decision_note,
        decided_at=waiver.decided_at,
        created_at=waiver.created_at,
    )


def _action_out(action: MembershipAction, member_name: str | None = None) -> ActionOut:
    return ActionOut(
        id=action.id,
        member_id=action.member_id,
        member_name=member_name,
        type=action.type,
        reason=action.reason,
        written_notice_at=action.written_notice_at,
        response_deadline=action.response_deadline,
        member_response=action.member_response,
        member_response_at=action.member_response_at,
        status=action.status,
        decision=action.decision,
        decided_at=action.decided_at,
        notification_email_sent=action.notification_email_sent,
    )


def _appeal_out(appeal: MembershipAppeal, reviewer_name: str | None = None) -> AppealOut:
    return AppealOut(
        id=appeal.id,
        membership_action_id=appeal.membership_action_id,
        application_id=appeal.application_id,
        filed_by_member_id=appeal.filed_by_member_id,
        grounds=appeal.grounds,
        filed_at=appeal.filed_at,
        window_expires_at=appeal.window_expires_at,
        assigned_reviewer_admin_id=appeal.assigned_reviewer_admin_id,
        reviewer_name=reviewer_name,
        status=appeal.status,
        decision=appeal.decision,
        decided_at=appeal.decided_at,
    )


async def _load_member(db: AsyncSession, member_id: int) -> Member:
    member = (await db.execute(select(Member).where(Member.id == member_id))).scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    return member


async def _original_decision_maker(
    db: AsyncSession, appeal: MembershipAppeal
) -> tuple[int | None, str]:
    """(admin id, source) of the original decision this appeal challenges."""
    if appeal.application_id is not None:
        application = await _load_application(db, appeal.application_id)
        return application.reviewed_by_admin_id, "application"
    if appeal.membership_action_id is not None:
        action = (
            await db.execute(
                select(MembershipAction).where(MembershipAction.id == appeal.membership_action_id)
            )
        ).scalar_one_or_none()
        if action is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Action not found")
        return action.decided_by_admin_id, "membership_action"
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="Appeal must reference an application or a membership action",
    )


async def _email_member(
    member_email: str, subject: str, body: str
) -> bool:
    return await send_with_retries(
        lambda: send_email(to=member_email, subject=f"{ORG_NAME} - {subject}", html_body=body)
    )


def _html_paragraphs(*paragraphs: str) -> str:
    return "".join(f"<p>{p}</p>" for p in paragraphs)


# ---------------------------------------------------------------------------
# Member endpoints - applications
# ---------------------------------------------------------------------------


@router.post("/member/membership-applications", response_model=ApplicationOut)
async def submit_application(
    payload: ApplicationCreate,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_member),
) -> ApplicationOut:
    application = MembershipApplication(
        application_no=await _next_application_no(db),
        full_name=payload.full_name,
        father_name=payload.father_name,
        mother_name=payload.mother_name,
        spouse_name=payload.spouse_name,
        mobile=payload.mobile,
        email=payload.email,
        address_house=payload.address_house,
        address_road=payload.address_road,
        address_post_office=payload.address_post_office,
        address_upazila=payload.address_upazila,
        address_district=payload.address_district,
        address_division=payload.address_division,
        ownership_type=payload.ownership_type,
        consent=payload.consent,
        member_id=member.id,
        status=APP_STATUS_RECEIVED,
        submitted_at=_now(),
        sla_due_at=add_working_days(_today(), MEMBERSHIP_SLA_WORKING_DAYS),
    )
    db.add(application)
    await db.flush()
    record_audit(
        db,
        actor_admin_id=None,
        action="membership_application.submitted",
        entity_type="membership_application",
        entity_id=str(application.id),
        detail=json.dumps({"member_id": member.id, "note": payload.full_name}, ensure_ascii=False),
    )
    await db.commit()
    await db.refresh(application)
    return await _application_detail(db, application)


@router.get("/member/membership-applications", response_model=list[ApplicationOut])
async def my_applications(
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_member),
) -> list[ApplicationOut]:
    rows = (
        await db.execute(
            select(MembershipApplication)
            .where(MembershipApplication.member_id == member.id)
            .order_by(MembershipApplication.submitted_at.desc())
        )
    ).scalars().all()
    names = await _actor_names(db, {a.reviewed_by_admin_id for a in rows})
    return [
        _application_out(
            application,
            [
                TimelineEvent(event="submitted", at=application.submitted_at, actor=application.full_name)
            ]
            + (
                [
                    TimelineEvent(
                        event=f"reviewed_{application.status}",
                        at=application.reviewed_at,
                        actor=names.get(application.reviewed_by_admin_id),
                        note=application.rejection_reason,
                    )
                ]
                if application.reviewed_at
                else []
            ),
        )
        for application in rows
    ]


@router.get("/member/membership-applications/{application_id}", response_model=ApplicationOut)
async def my_application_detail(
    application_id: int,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_member),
) -> ApplicationOut:
    application = await _load_application(db, application_id)
    if application.member_id != member.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your application")
    return await _application_detail(db, application)


@router.post("/member/membership-applications/{application_id}/documents")
async def upload_application_documents(
    application_id: int,
    nid_document: UploadFile | None = File(None),
    ownership_document: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_member),
) -> dict:
    application = await _load_application(db, application_id)
    if application.member_id != member.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your application")
    saved: dict[str, bool] = {}
    if nid_document is not None and nid_document.filename:
        application.nid_document_path = await save_upload_file(
            nid_document, f"membership/{application.application_no}"
        )
        saved["nid_document"] = True
    if ownership_document is not None and ownership_document.filename:
        application.ownership_document_path = await save_upload_file(
            ownership_document, f"membership/{application.application_no}"
        )
        saved["ownership_document"] = True
    if not saved:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No document provided"
        )
    record_audit(
        db,
        actor_admin_id=None,
        action="membership_application.documents_uploaded",
        entity_type="membership_application",
        entity_id=str(application.id),
        detail=json.dumps(saved),
    )
    await db.commit()
    return {"saved": saved}


async def _stream_own_document(
    db: AsyncSession, member: Member, relative_path: str | None, filename: str
) -> FileResponse:
    if not relative_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No document on file")
    path = settings.upload_root / relative_path
    if not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File missing on disk")
    return FileResponse(path, filename=filename)


@router.get("/member/membership-applications/{application_id}/documents/{kind}/download")
async def download_application_document(
    application_id: int,
    kind: str,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_member),
) -> FileResponse:
    """Sensitive NID/ownership documents stream only to the owning member
    (or an admin holding member.view_all) - never via the public /uploads URL."""
    application = await _load_application(db, application_id)
    if application.member_id != member.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your document")
    if kind == "nid":
        return await _stream_own_document(
            db, member, application.nid_document_path, f"{application.application_no}-nid"
        )
    if kind == "ownership":
        return await _stream_own_document(
            db, member, application.ownership_document_path, f"{application.application_no}-ownership"
        )
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown document kind")


# ---------------------------------------------------------------------------
# Member endpoints - appeals
# ---------------------------------------------------------------------------


@router.post("/member/appeals", response_model=AppealOut)
async def file_appeal(
    payload: AppealCreate,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_member),
) -> AppealOut:
    if payload.application_id is None and payload.membership_action_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide application_id or membership_action_id",
        )

    decided_at: datetime | None = None
    if payload.application_id is not None:
        application = await _load_application(db, payload.application_id)
        if application.member_id != member.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your application")
        if application.status not in (APP_STATUS_APPROVED, APP_STATUS_REJECTED):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only a decided application can be appealed",
            )
        decided_at = application.reviewed_at
    else:
        action = (
            await db.execute(
                select(MembershipAction).where(MembershipAction.id == payload.membership_action_id)
            )
        ).scalar_one_or_none()
        if action is None or action.member_id != member.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Action not found")
        if action.status != ACTION_STATUS_DECIDED:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only a decided membership action can be appealed",
            )
        decided_at = action.decided_at

    if decided_at is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="No recorded decision date to appeal"
        )

    window_expires_at = date(decided_at.year, decided_at.month, decided_at.day)  # decision date
    from datetime import timedelta

    window_expires_at = window_expires_at + timedelta(days=APPEAL_WINDOW_DAYS)
    if _today() > window_expires_at:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Appeal window closed on {window_expires_at.isoformat()} "
            f"({APPEAL_WINDOW_DAYS} days after the decision)",
        )

    appeal = MembershipAppeal(
        membership_action_id=payload.membership_action_id,
        application_id=payload.application_id,
        filed_by_member_id=member.id,
        grounds=payload.grounds,
        filed_at=_now(),
        window_expires_at=window_expires_at,
        status=APPEAL_STATUS_SUBMITTED,
    )
    db.add(appeal)
    await db.flush()
    record_audit(
        db,
        actor_admin_id=None,
        action="membership_appeal.filed",
        entity_type="membership_appeal",
        entity_id=str(appeal.id),
        detail=json.dumps({"member_id": member.id}, ensure_ascii=False),
    )
    await db.commit()
    await db.refresh(appeal)
    return _appeal_out(appeal)


@router.get("/member/appeals", response_model=list[AppealOut])
async def my_appeals(
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_member),
) -> list[AppealOut]:
    rows = (
        await db.execute(
            select(MembershipAppeal)
            .where(MembershipAppeal.filed_by_member_id == member.id)
            .order_by(MembershipAppeal.filed_at.desc())
        )
    ).scalars().all()
    names = await _actor_names(db, {a.assigned_reviewer_admin_id for a in rows})
    return [_appeal_out(a, names.get(a.assigned_reviewer_admin_id)) for a in rows]


# ---------------------------------------------------------------------------
# Member endpoints - fee waivers
# ---------------------------------------------------------------------------


@router.post("/member/fee-waivers", response_model=WaiverOut)
async def apply_for_waiver(
    payload: WaiverCreate,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_member),
) -> WaiverOut:
    if not payload.reason.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Reason is required"
        )
    waiver = FeeWaiver(
        member_id=member.id,
        type=payload.type,
        reason=payload.reason,
        months=payload.months,
        installment_plan=json.dumps(payload.installment_plan, ensure_ascii=False)
        if payload.installment_plan
        else None,
        status=WAIVER_STATUS_PENDING,
    )
    db.add(waiver)
    await db.flush()
    record_audit(
        db,
        actor_admin_id=None,
        action="fee_waiver.applied",
        entity_type="fee_waiver",
        entity_id=str(waiver.id),
        detail=json.dumps({"member_id": member.id, "type": waiver.type}, ensure_ascii=False),
    )
    await db.commit()
    await db.refresh(waiver)
    return _waiver_out(waiver)


@router.get("/member/fee-waivers", response_model=list[WaiverOut])
async def my_waivers(
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_member),
) -> list[WaiverOut]:
    rows = (
        await db.execute(
            select(FeeWaiver)
            .where(FeeWaiver.member_id == member.id)
            .order_by(FeeWaiver.created_at.desc())
        )
    ).scalars().all()
    return [_waiver_out(w) for w in rows]


# ---------------------------------------------------------------------------
# Member endpoints - membership actions
# ---------------------------------------------------------------------------


@router.get("/member/membership-actions", response_model=list[ActionOut])
async def my_actions(
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_member),
) -> list[ActionOut]:
    rows = (
        await db.execute(
            select(MembershipAction)
            .where(MembershipAction.member_id == member.id)
            .order_by(MembershipAction.created_at.desc())
        )
    ).scalars().all()
    return [_action_out(a) for a in rows]


@router.post("/member/membership-actions/{action_id}/response", response_model=ActionOut)
async def respond_to_action(
    action_id: int,
    payload: MemberResponse,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_member),
) -> ActionOut:
    action = (
        await db.execute(select(MembershipAction).where(MembershipAction.id == action_id))
    ).scalar_one_or_none()
    if action is None or action.member_id != member.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Action not found")
    if action.status not in (ACTION_STATUS_NOTICED, ACTION_STATUS_AWAITING_RESPONSE):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="This action is not open for a response"
        )
    if action.response_deadline is not None and _today() > action.response_deadline:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="The response deadline has passed"
        )
    action.member_response = payload.response
    action.member_response_at = _now()
    action.status = ACTION_STATUS_AWAITING_RESPONSE
    record_audit(
        db,
        actor_admin_id=None,
        action="membership_action.member_response",
        entity_type="membership_action",
        entity_id=str(action.id),
        detail=json.dumps({"note": payload.response[:200]}, ensure_ascii=False),
    )
    await db.commit()
    await db.refresh(action)
    return _action_out(action)


# ---------------------------------------------------------------------------
# Member endpoints - data correction requests
# ---------------------------------------------------------------------------


@router.post("/member/data-correction-requests", response_model=CorrectionOut)
async def request_correction(
    payload: CorrectionCreate,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_member),
) -> CorrectionOut:
    request = DataCorrectionRequest(
        member_id=member.id,
        field=payload.field,
        requested_value=payload.requested_value,
        reason=payload.reason,
        status=CORRECTION_STATUS_PENDING,
    )
    db.add(request)
    await db.flush()
    record_audit(
        db,
        actor_admin_id=None,
        action="data_correction.requested",
        entity_type="data_correction_request",
        entity_id=str(request.id),
        detail=json.dumps(
            {"member_id": member.id, "field": payload.field}, ensure_ascii=False
        ),
    )
    await db.commit()
    await db.refresh(request)
    return _correction_out(request)


def _correction_out(request: DataCorrectionRequest, member_name: str | None = None) -> CorrectionOut:
    return CorrectionOut(
        id=request.id,
        member_id=request.member_id,
        member_name=member_name,
        field=request.field,
        requested_value=request.requested_value,
        reason=request.reason,
        status=request.status,
        admin_note=request.admin_note,
        handled_at=request.handled_at,
        created_at=request.created_at,
    )


@router.get("/member/data-correction-requests", response_model=list[CorrectionOut])
async def my_correction_requests(
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_member),
) -> list[CorrectionOut]:
    rows = (
        await db.execute(
            select(DataCorrectionRequest)
            .where(DataCorrectionRequest.member_id == member.id)
            .order_by(DataCorrectionRequest.created_at.desc())
        )
    ).scalars().all()
    return [_correction_out(r) for r in rows]


# ---------------------------------------------------------------------------
# Member endpoints - my documents (authenticated streaming only)
# ---------------------------------------------------------------------------


@router.get("/member/my-documents")
async def my_documents(
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_member),
) -> dict:
    """List the member's own uploaded documents with authenticated download
    links - the raw /uploads URL is never exposed for these."""
    documents: list[dict[str, str]] = []
    if member.member_photo_path:
        documents.append({"kind": "photo", "label": "member_photo", "url": f"/api/member/my-documents/photo/download"})
    if member.receipt_photo_path:
        documents.append({"kind": "receipt", "label": "receipt_photo", "url": f"/api/member/my-documents/receipt/download"})
    rows = (
        await db.execute(
            select(MembershipApplication).where(MembershipApplication.member_id == member.id)
        )
    ).scalars().all()
    for application in rows:
        if application.nid_document_path:
            documents.append(
                {
                    "kind": "nid",
                    "label": f"{application.application_no} NID",
                    "url": f"/api/member/membership-applications/{application.id}/documents/nid/download",
                }
            )
        if application.ownership_document_path:
            documents.append(
                {
                    "kind": "ownership",
                    "label": f"{application.application_no} ownership",
                    "url": f"/api/member/membership-applications/{application.id}/documents/ownership/download",
                }
            )
    return {"documents": documents}


@router.get("/member/my-documents/{kind}/download")
async def download_my_document(
    kind: str,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_member),
) -> FileResponse:
    path_map = {
        "photo": member.member_photo_path,
        "receipt": member.receipt_photo_path,
    }
    relative = path_map.get(kind)
    if relative is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown document kind")
    return await _stream_own_document(db, member, relative, kind)


# ---------------------------------------------------------------------------
# Admin endpoints - application review
# ---------------------------------------------------------------------------


@router.get("/admin/membership-applications", response_model=list[ApplicationOut])
async def list_applications(
    status_filter: str | None = None,
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_permission("membership_application.manage")),
) -> list[ApplicationOut]:
    query = select(MembershipApplication).order_by(MembershipApplication.submitted_at.desc())
    if status_filter:
        if status_filter not in APPLICATION_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"status must be one of: {', '.join(APPLICATION_STATUSES)}",
            )
        query = query.where(MembershipApplication.status == status_filter)
    rows = (await db.execute(query)).scalars().all()
    # _application_timeline reads `application.audit_rows`, which the detail
    # loader assigns ad-hoc (see _application_detail). Batch-load the same
    # audit rows for the whole list so the queue endpoint does not 500 and
    # does not regress to a per-row query.
    audit_by_application: dict[int, list[AuditLog]] = {}
    if rows:
        audit_rows = (
            await db.execute(
                select(AuditLog)
                .where(
                    AuditLog.entity_type == "membership_application",
                    AuditLog.entity_id.in_([str(a.id) for a in rows]),
                )
                .order_by(AuditLog.created_at)
            )
        ).scalars().all()
        for row in audit_rows:
            audit_by_application.setdefault(int(row.entity_id), []).append(row)
    names = await _actor_names(
        db,
        {a.reviewed_by_admin_id for a in rows}
        | {r.actor_admin_id for rs in audit_by_application.values() for r in rs},
    )
    out: list[ApplicationOut] = []
    for application in rows:
        application.audit_rows = audit_by_application.get(application.id, [])  # type: ignore[attr-defined]
        out.append(_application_out(application, _application_timeline(application, names)))
    return out


@router.get("/admin/membership-applications/{application_id}", response_model=ApplicationOut)
async def application_detail_admin(
    application_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_permission("membership_application.manage")),
) -> ApplicationOut:
    return await _application_detail(db, await _load_application(db, application_id))


@router.post("/admin/membership-applications/{application_id}/start-review", response_model=ApplicationOut)
async def start_review(
    application_id: int,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("membership_application.manage")),
) -> ApplicationOut:
    application = await _load_application(db, application_id)
    if application.status != APP_STATUS_RECEIVED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only a received application can move to review",
        )
    application.status = APP_STATUS_UNDER_REVIEW
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="membership_application.start_review",
        entity_type="membership_application",
        entity_id=str(application.id),
        detail=json.dumps({"old": application.status, "new": APP_STATUS_UNDER_REVIEW}, ensure_ascii=False),
    )
    await db.commit()
    await db.refresh(application)
    return await _application_detail(db, application)


@router.post("/admin/membership-applications/{application_id}/approve", response_model=ApplicationOut)
async def approve_application(
    application_id: int,
    payload: ApplicationApprove,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("membership_application.manage")),
) -> ApplicationOut:
    application = await _load_application(db, application_id)
    if application.status == APP_STATUS_APPROVED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already approved")
    if application.status == APP_STATUS_REJECTED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A rejected application cannot be approved")

    member_id = payload.member_id or application.member_id
    if member_id is None:
        # Approving an application with no linked member creates the Member
        # record with the application's data (unavailable registry fields get
        # neutral placeholders the committee completes later).
        member = Member(
            member_id=application.application_no,
            status=MemberStatus.APPROVED,
            full_name=application.full_name,
            father_or_husband=application.father_name,
            mother=application.mother_name,
            dob="1900-01-01",
            nationality="বাংলাদেশী",
            occupation="অজানা",
            nid="",
            mobile=application.mobile,
            gender="অজানা",
            email=application.email,
            admission_fee="0",
            subscription="0",
            receipt_no=application.application_no,
            payment_method="pending",
            submission_date=_today().isoformat(),
            member_class=payload.member_class,
        )
        db.add(member)
        await db.flush()
        member_id = member.id
    else:
        member = await _load_member(db, member_id)
        if member.status == MemberStatus.PENDING:
            await ensure_dag_filled(db, member.id)
        member.member_class = payload.member_class
        if member.status == MemberStatus.PENDING:
            member.status = MemberStatus.APPROVED
            member.reviewed_at = _now()
            member.reviewed_by = admin.id

    application.member_id = member_id
    application.status = APP_STATUS_APPROVED
    application.reviewed_at = _now()
    application.reviewed_by_admin_id = admin.id
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="membership_application.approved",
        entity_type="membership_application",
        entity_id=str(application.id),
        detail=json.dumps(
            {"member_id": member_id, "member_class": payload.member_class, "old_status": application.status, "new_status": APP_STATUS_APPROVED},
            ensure_ascii=False,
        ),
    )
    await db.commit()
    await db.refresh(application)
    return await _application_detail(db, application)


@router.post("/admin/membership-applications/{application_id}/reject", response_model=ApplicationOut)
async def reject_application(
    application_id: int,
    payload: RejectPayload,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("membership_application.manage")),
) -> ApplicationOut:
    application = await _load_application(db, application_id)
    if not payload.reason.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Rejection reason is required"
        )
    if application.status == APP_STATUS_REJECTED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already rejected")
    old_status = application.status
    application.status = APP_STATUS_REJECTED
    application.rejection_reason = payload.reason
    application.reviewed_at = _now()
    application.reviewed_by_admin_id = admin.id
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="membership_application.rejected",
        entity_type="membership_application",
        entity_id=str(application.id),
        detail=json.dumps({"old": old_status, "new": APP_STATUS_REJECTED, "reason": payload.reason}, ensure_ascii=False),
    )
    await db.commit()
    await db.refresh(application)

    application.notification_status = (
        "sent"
        if await _email_member(
            application.email,
            "আবেদন বাতিল",
            _html_paragraphs(
                f"প্রিয় {application.full_name},",
                f"দুঃখিত, আপনার সদস্যপদের আবেদন ( {application.application_no} ) বাতিল করা হয়েছে।",
                f"কারণ: {payload.reason}",
            ),
        )
        else "failed"
    )
    await db.commit()
    await db.refresh(application)
    return await _application_detail(db, application)


@router.get("/admin/membership-applications/{application_id}/letter.pdf")
async def application_letter_pdf(
    application_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_permission("membership_application.manage")),
) -> Response:
    application = await _load_application(db, application_id)
    if application.status == APP_STATUS_REJECTED:
        title = "আবেদন বাতিলের পত্র"
        body: list[tuple[str, list[str]]] = [
            ("বিষয়: সদস্যপদের আবেদন বাতিল", []),
            (
                "বিস্তারিত",
                [
                    f"প্রিয় {application.full_name},",
                    f"আপনার আবেদন নম্বর {application.application_no} বাতিল করা হয়েছে।",
                    f"কারণ: {application.rejection_reason or '-'}",
                    f"আপিলের সময়সীমা: সিদ্ধান্তের {APPEAL_WINDOW_DAYS} দিনের মধ্যে।",
                ],
            ),
        ]
    else:
        title = "আবেদন স্বীকৃতিপত্র"
        body = [
            ("বিষয়: সদস্যপদের আবেদন গৃহীত হয়েছে", []),
            (
                "বিস্তারিত",
                [
                    f"প্রিয় {application.full_name},",
                    f"আপনার আবেদন নম্বর {application.application_no} গৃহীত হয়েছে।",
                    f"স্লা সময়সীমা: {application.sla_due_at.isoformat()} ({MEMBERSHIP_SLA_WORKING_DAYS} কার্যদিবস)।",
                ],
            ),
        ]
    pdf_bytes = render_letter(title=title, ref_no=application.application_no, body_sections=body)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{application.application_no}-letter.pdf"'
        },
    )


# ---------------------------------------------------------------------------
# Admin endpoints - fee waivers
# ---------------------------------------------------------------------------


@router.get("/admin/fee-waivers", response_model=list[WaiverOut])
async def list_waivers(
    status_filter: str | None = None,
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_permission("member_waiver.manage")),
) -> list[WaiverOut]:
    query = select(FeeWaiver).order_by(FeeWaiver.created_at.desc())
    if status_filter:
        if status_filter not in WAIVER_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"status must be one of: {', '.join(WAIVER_STATUSES)}",
            )
        query = query.where(FeeWaiver.status == status_filter)
    rows = (await db.execute(query)).scalars().all()
    member_names = dict(
        (
            await db.execute(select(Member.id, Member.full_name).where(Member.id.in_({w.member_id for w in rows})))
        ).all()
    ) if rows else {}
    return [_waiver_out(w, member_names.get(w.member_id)) for w in rows]


@router.post("/admin/fee-waivers/{waiver_id}/decide", response_model=WaiverOut)
async def decide_waiver(
    waiver_id: int,
    payload: WaiverDecision,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("member_waiver.manage")),
) -> WaiverOut:
    waiver = (
        await db.execute(select(FeeWaiver).where(FeeWaiver.id == waiver_id))
    ).scalar_one_or_none()
    if waiver is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Waiver not found")
    if waiver.status != WAIVER_STATUS_PENDING:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Waiver already decided")
    waiver.status = payload.status
    waiver.decision_note = payload.note
    waiver.decided_by_admin_id = admin.id
    waiver.decided_at = _now()
    record_audit(
        db,
        actor_admin_id=admin.id,
        action=f"fee_waiver.{payload.status}",
        entity_type="fee_waiver",
        entity_id=str(waiver.id),
        detail=json.dumps({"old": WAIVER_STATUS_PENDING, "new": payload.status, "note": payload.note}, ensure_ascii=False),
    )
    await db.commit()
    await db.refresh(waiver)
    member = await db.get(Member, waiver.member_id)
    return _waiver_out(waiver, member.full_name if member else None)


# ---------------------------------------------------------------------------
# Admin endpoints - suspension/termination workflow
# ---------------------------------------------------------------------------


@router.post("/admin/member-governance/{member_id}/suspension-notice", response_model=ActionOut)
async def suspension_notice(
    member_id: int,
    payload: SuspensionNoticePayload,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("member_suspension.manage")),
) -> ActionOut:
    """Written notice BEFORE suspension: records suspension_notice_at + reason
    on the member and opens a MembershipAction; never gates member access."""
    member = await _load_member(db, member_id)
    action = MembershipAction(
        member_id=member.id,
        type=ACTION_TYPE_SUSPEND,
        reason=payload.reason,
        status=ACTION_STATUS_DRAFT,
    )
    db.add(action)
    await db.flush()
    action.written_notice_at = _now()
    action.response_deadline = add_working_days(_today(), RESPONSE_WINDOW_WORKING_DAYS)
    action.status = ACTION_STATUS_NOTICED
    member.suspension_notice_at = action.written_notice_at
    member.suspension_reason = payload.reason
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="membership_action.notice_sent",
        entity_type="membership_action",
        entity_id=str(action.id),
        detail=json.dumps(
            {"member_id": member.id, "reason": payload.reason,
             "response_deadline": action.response_deadline.isoformat()},
            ensure_ascii=False,
        ),
    )
    await db.commit()
    await db.refresh(action)
    sent = await _email_member(
        member.email,
        "সাসপেনশন নোটিশ",
        _html_paragraphs(
            f"প্রিয় {member.full_name},",
            f"আপনাকে একটি সাসপেনশন নোটিশ দেওয়া হয়েছে। কারণ: {payload.reason}",
            f"অনুগত জবাব দেওয়ার শেষ তারিখ: {action.response_deadline.isoformat()}",
        ),
    )
    action.notification_email_sent = sent
    await db.commit()
    await db.refresh(action)
    return _action_out(action)


@router.post("/admin/member-governance/{member_id}/suspend", response_model=ActionOut)
async def suspend_member(
    member_id: int,
    payload: SuspensionNoticePayload,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("member_suspension.manage")),
) -> ActionOut:
    """Suspend only after a written notice exists. A governance record only -
    the member's own access is never blocked."""
    member = await _load_member(db, member_id)
    if member.suspension_notice_at is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A written suspension notice must be issued before suspension",
        )
    member.governance_status = GOVERNANCE_STATUS_SUSPENDED
    member.suspension_reason = payload.reason
    action = MembershipAction(
        member_id=member.id,
        type=ACTION_TYPE_SUSPEND,
        reason=payload.reason,
        written_notice_at=member.suspension_notice_at,
        response_deadline=add_working_days(_today(), RESPONSE_WINDOW_WORKING_DAYS),
        status=ACTION_STATUS_DECIDED,
        decision=payload.reason,
        decided_by_admin_id=admin.id,
        decided_at=_now(),
    )
    db.add(action)
    await db.flush()
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="membership_action.suspended",
        entity_type="member",
        entity_id=str(member.id),
        detail=json.dumps({"old": GOVERNANCE_STATUS_ACTIVE, "new": GOVERNANCE_STATUS_SUSPENDED, "reason": payload.reason}, ensure_ascii=False),
    )
    await db.commit()
    await db.refresh(action)
    return _action_out(action)


@router.post("/admin/membership-actions", response_model=ActionOut)
async def create_action(
    payload: ActionCreate,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("member_suspension.manage")),
) -> ActionOut:
    member = await _load_member(db, payload.member_id)
    action = MembershipAction(
        member_id=member.id,
        type=payload.type,
        reason=payload.reason,
        status=ACTION_STATUS_DRAFT,
    )
    db.add(action)
    await db.flush()
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="membership_action.created",
        entity_type="membership_action",
        entity_id=str(action.id),
        detail=json.dumps({"member_id": member.id, "type": payload.type, "reason": payload.reason}, ensure_ascii=False),
    )
    await db.commit()
    await db.refresh(action)
    return _action_out(action, member.full_name)


@router.get("/admin/membership-actions", response_model=list[ActionOut])
async def list_actions(
    status_filter: str | None = None,
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_permission("member_suspension.manage")),
) -> list[ActionOut]:
    query = select(MembershipAction).order_by(MembershipAction.created_at.desc())
    if status_filter:
        if status_filter not in ACTION_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"status must be one of: {', '.join(ACTION_STATUSES)}",
            )
        query = query.where(MembershipAction.status == status_filter)
    rows = (await db.execute(query)).scalars().all()
    names = dict(
        (
            await db.execute(select(Member.id, Member.full_name).where(Member.id.in_({a.member_id for a in rows})))
        ).all()
    ) if rows else {}
    return [_action_out(a, names.get(a.member_id)) for a in rows]


@router.post("/admin/membership-actions/{action_id}/notice", response_model=ActionOut)
async def notice_action(
    action_id: int,
    _payload: ActionNotice,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("member_suspension.manage")),
) -> ActionOut:
    action = (
        await db.execute(select(MembershipAction).where(MembershipAction.id == action_id))
    ).scalar_one_or_none()
    if action is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Action not found")
    if action.status != ACTION_STATUS_DRAFT:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only a draft action can be noticed")
    member = await _load_member(db, action.member_id)
    action.written_notice_at = _now()
    action.response_deadline = add_working_days(_today(), RESPONSE_WINDOW_WORKING_DAYS)
    action.status = ACTION_STATUS_NOTICED
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="membership_action.noticed",
        entity_type="membership_action",
        entity_id=str(action.id),
        detail=json.dumps({"response_deadline": action.response_deadline.isoformat()}, ensure_ascii=False),
    )
    await db.commit()
    await db.refresh(action)
    action.notification_email_sent = await _email_member(
        member.email,
        "লিখিত নোটিশ",
        _html_paragraphs(
            f"প্রিয় {member.full_name},",
            f"আপনার বিরুদ্ধে {action.type} পদক্ষেপের লিখিত নোটিশ দেওয়া হয়েছে। কারণ: {action.reason}",
            f"জবাব দেওয়ার শেষ তারিখ: {action.response_deadline.isoformat()}",
        ),
    )
    await db.commit()
    await db.refresh(action)
    return _action_out(action, member.full_name)


@router.post("/admin/membership-actions/{action_id}/decide", response_model=ActionOut)
async def decide_action(
    action_id: int,
    payload: ActionDecide,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("member_suspension.manage")),
) -> ActionOut:
    action = (
        await db.execute(select(MembershipAction).where(MembershipAction.id == action_id))
    ).scalar_one_or_none()
    if action is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Action not found")
    if action.status in (ACTION_STATUS_DECIDED, ACTION_STATUS_CANCELLED):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Action already closed")
    member = await _load_member(db, action.member_id)
    action.decision = payload.decision
    action.decided_by_admin_id = admin.id
    action.decided_at = _now()
    action.status = ACTION_STATUS_DECIDED
    if payload.confirm_action and action.type == ACTION_TYPE_SUSPEND:
        member.governance_status = GOVERNANCE_STATUS_SUSPENDED
        member.suspension_reason = action.reason
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="membership_action.decided",
        entity_type="membership_action",
        entity_id=str(action.id),
        detail=json.dumps({"decision": payload.decision, "confirm_action": payload.confirm_action}, ensure_ascii=False),
    )
    await db.commit()
    await db.refresh(action)
    await _email_member(
        member.email,
        "সিদ্ধান্ত জানিয়েছে",
        _html_paragraphs(
            f"প্রিয় {member.full_name},",
            f"আপনার বিরুদ্ধে {action.type} পদক্ষেপের সিদ্ধান্ত জানানো হলো: {payload.decision}",
            f"আপিল করতে চাইলে সিদ্ধান্তের {APPEAL_WINDOW_DAYS} দিনের মধ্যে আবেদন করুন।",
        ),
    )
    return _action_out(action, member.full_name)


@router.post("/admin/membership-actions/{action_id}/cancel", response_model=ActionOut)
async def cancel_action(
    action_id: int,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("member_suspension.manage")),
) -> ActionOut:
    action = (
        await db.execute(select(MembershipAction).where(MembershipAction.id == action_id))
    ).scalar_one_or_none()
    if action is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Action not found")
    if action.status == ACTION_STATUS_DECIDED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A decided action cannot be cancelled")
    action.status = ACTION_STATUS_CANCELLED
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="membership_action.cancelled",
        entity_type="membership_action",
        entity_id=str(action.id),
        detail=json.dumps({"old_status": action.status}, ensure_ascii=False),
    )
    await db.commit()
    await db.refresh(action)
    member = await db.get(Member, action.member_id)
    return _action_out(action, member.full_name if member else None)


# ---------------------------------------------------------------------------
# Admin endpoints - appeals
# ---------------------------------------------------------------------------


@router.get("/admin/appeals", response_model=list[AppealOut])
async def list_appeals(
    status_filter: str | None = None,
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_permission("membership_appeal.manage")),
) -> list[AppealOut]:
    query = select(MembershipAppeal).order_by(MembershipAppeal.filed_at.desc())
    if status_filter:
        if status_filter not in APPEAL_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"status must be one of: {', '.join(APPEAL_STATUSES)}",
            )
        query = query.where(MembershipAppeal.status == status_filter)
    rows = (await db.execute(query)).scalars().all()
    names = await _actor_names(db, {a.assigned_reviewer_admin_id for a in rows})
    return [_appeal_out(a, names.get(a.assigned_reviewer_admin_id)) for a in rows]


@router.post("/admin/appeals/{appeal_id}/assign", response_model=AppealOut)
async def assign_appeal(
    appeal_id: int,
    payload: AppealAssign,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("membership_appeal.manage")),
) -> AppealOut:
    appeal = (
        await db.execute(select(MembershipAppeal).where(MembershipAppeal.id == appeal_id))
    ).scalar_one_or_none()
    if appeal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appeal not found")
    if appeal.status not in (APPEAL_STATUS_SUBMITTED, APPEAL_STATUS_UNDER_REVIEW):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Appeal already decided")
    reviewer = await db.get(AdminUser, payload.reviewer_admin_id)
    if reviewer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reviewer not found")

    original_maker, source = await _original_decision_maker(db, appeal)
    # HARD RULE: the reviewer must differ from the original decision-maker.
    if original_maker is not None and payload.reviewer_admin_id == original_maker:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The assigned reviewer must not be the original decision-maker "
            f"({source})",
        )
    appeal.assigned_reviewer_admin_id = payload.reviewer_admin_id
    if appeal.status == APPEAL_STATUS_SUBMITTED:
        appeal.status = APPEAL_STATUS_UNDER_REVIEW
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="membership_appeal.assigned",
        entity_type="membership_appeal",
        entity_id=str(appeal.id),
        detail=json.dumps(
            {"reviewer_admin_id": payload.reviewer_admin_id, "original_maker": original_maker},
            ensure_ascii=False,
        ),
    )
    await db.commit()
    await db.refresh(appeal)
    return _appeal_out(appeal, reviewer.name)


@router.post("/admin/appeals/{appeal_id}/decide", response_model=AppealOut)
async def decide_appeal(
    appeal_id: int,
    payload: AppealDecision,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("membership_appeal.manage")),
) -> AppealOut:
    appeal = (
        await db.execute(select(MembershipAppeal).where(MembershipAppeal.id == appeal_id))
    ).scalar_one_or_none()
    if appeal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appeal not found")
    if appeal.status in APPEAL_STATUS_DECIDED_STATES:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Appeal already decided")
    if appeal.assigned_reviewer_admin_id is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Assign a reviewer before deciding"
        )
    if admin.id != appeal.assigned_reviewer_admin_id and not is_super_admin(admin):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only the assigned reviewer (or a super admin) may decide this appeal",
        )
    appeal.status = payload.status
    appeal.decision = payload.decision
    appeal.decided_by_admin_id = admin.id
    appeal.decided_at = _now()
    record_audit(
        db,
        actor_admin_id=admin.id,
        action=f"membership_appeal.{payload.status}",
        entity_type="membership_appeal",
        entity_id=str(appeal.id),
        detail=json.dumps({"decision": payload.decision}, ensure_ascii=False),
    )
    await db.commit()
    await db.refresh(appeal)

    member = await db.get(Member, appeal.filed_by_member_id)
    if member is not None:
        appeal.notification_status = (
            "sent"
            if await _email_member(
                member.email,
                "আপিলের সিদ্ধান্ত",
                _html_paragraphs(
                    f"প্রিয় {member.full_name},",
                    f"আপনার আপিলের সিদ্ধান্ত: {payload.status}",
                    payload.decision,
                ),
            )
            else "failed"
        )
        await db.commit()
        await db.refresh(appeal)
    return _appeal_out(appeal)


# ---------------------------------------------------------------------------
# Admin endpoints - data correction requests queue
# ---------------------------------------------------------------------------


@router.get("/admin/data-correction-requests", response_model=list[CorrectionOut])
async def list_corrections(
    status_filter: str | None = None,
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_permission("member.manage")),
) -> list[CorrectionOut]:
    query = select(DataCorrectionRequest).order_by(DataCorrectionRequest.created_at.desc())
    if status_filter:
        if status_filter not in CORRECTION_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"status must be one of: {', '.join(CORRECTION_STATUSES)}",
            )
        query = query.where(DataCorrectionRequest.status == status_filter)
    rows = (await db.execute(query)).scalars().all()
    names = dict(
        (
            await db.execute(select(Member.id, Member.full_name).where(Member.id.in_({r.member_id for r in rows})))
        ).all()
    ) if rows else {}
    return [_correction_out(r, names.get(r.member_id)) for r in rows]


@router.post("/admin/data-correction-requests/{request_id}/decide", response_model=CorrectionOut)
async def decide_correction(
    request_id: int,
    payload: CorrectionDecision,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("member.manage")),
) -> CorrectionOut:
    request = (
        await db.execute(select(DataCorrectionRequest).where(DataCorrectionRequest.id == request_id))
    ).scalar_one_or_none()
    if request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    if request.status != CORRECTION_STATUS_PENDING:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Request already handled")
    request.status = payload.status
    request.admin_note = payload.admin_note
    request.handled_by_admin_id = admin.id
    request.handled_at = _now()
    record_audit(
        db,
        actor_admin_id=admin.id,
        action=f"data_correction.{payload.status}",
        entity_type="data_correction_request",
        entity_id=str(request.id),
        detail=json.dumps({"field": request.field, "requested_value": request.requested_value, "note": payload.admin_note}, ensure_ascii=False),
    )
    await db.commit()
    await db.refresh(request)
    member = await db.get(Member, request.member_id)
    return _correction_out(request, member.full_name if member else None)


# ---------------------------------------------------------------------------
# Admin endpoint - চাঁদা বকেযা (subscription arrears) badge
# ---------------------------------------------------------------------------


@router.get("/admin/members-arrears")
async def members_arrears(
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_permission("member.view_all")),
) -> dict:
    """Arrears badge: expected monthly subscription since joining (base rate
    from the versioned FeeSetting) minus the maintenance-fee payments recorded
    in the unified fee ledger. The maintenance fee is where the monthly চাঁদা
    lives in fee_catalog; other fee types are never counted against it."""
    base_setting = (
        await db.execute(
            select(FeeSetting)
            .where(FeeSetting.key == "monthly_subscription_base_amount")
            .order_by(FeeSetting.start_date.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    base = float(base_setting.value) if base_setting is not None else 0.0

    paid_rows = (
        await db.execute(
            select(FeePayment.member_id, func.coalesce(func.sum(FeePayment.amount), 0.0))
            .where(FeePayment.fee_type == "maintenance")
            .group_by(FeePayment.member_id)
        )
    ).all()
    paid_by_member: dict[int, float] = {member_id: float(total) for member_id, total in paid_rows}

    members = (await db.execute(select(Member))).scalars().all()
    today = _today()
    items = []
    for member in members:
        started = member.created_at.date() if member.created_at else today
        months_expected = max(
            0, (today.year - started.year) * 12 + (today.month - started.month)
        )
        expected = months_expected * base
        paid = paid_by_member.get(member.id, 0.0)
        arrears = max(0.0, expected - paid)
        items.append(
            {
                "member_id": member.id,
                "full_name": member.full_name,
                "months_expected": months_expected,
                "expected_amount": round(expected, 2),
                "paid_amount": round(paid, 2),
                "arrears_amount": round(arrears, 2),
                "in_arrears": arrears > 0,
            }
        )
    items.sort(key=lambda item: item["arrears_amount"], reverse=True)
    return {"base_monthly": base, "items": items}
