"""Module 5 — অভিযোগ ব্যবস্থা (complaints, land-protection form, service
standards with live SLA performance).

SLA: acknowledge within 3 working days of submission, first substantive
update within 15 working days (services/governance.py). Assignment HARD RULE:
the assigned admin must not be the accused; a flagged close-relative assignment
requires a super-admin override, which is audit-logged.
"""

import json
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.deps import get_account_actor, get_current_admin, get_current_member, AccountActor
from app.core.permissions import can, is_super_admin, require_permission
from app.db.session import get_db
from app.models.admin import AdminUser
from app.models.audit_log import AuditLog
from app.models.complaint import (
    COMPLAINT_ACKNOWLEDGED,
    COMPLAINT_CLOSED,
    COMPLAINT_INVESTIGATING,
    COMPLAINT_REJECTED,
    COMPLAINT_RESOLVED,
    COMPLAINT_STATUSES,
    COMPLAINT_SUBMITTED,
    Complaint,
    DataCorrectionRequest,
)
from app.models.member import Member
from app.services.audit import record_audit
from app.services.governance import (
    APPEAL_WINDOW_DAYS,
    COMPLAINT_ACK_WORKING_DAYS,
    COMPLAINT_UPDATE_WORKING_DAYS,
    MEMBERSHIP_SLA_WORKING_DAYS,
    PETITION_RESPONSE_DAYS,
    add_working_days,
    sla_status,
    working_days_between,
)
from app.services.letters_pdf import render_letter
from app.services.storage import save_upload_file

settings = get_settings()

router = APIRouter(tags=["complaints"])

COMPLAINT_NO_PREFIX = "KRMF-AB"

ANTI_RETALIATION_NOTICE_BN = (
    "অভিযোগ করা আপনার সাংবিধানিক অধিকার। অভিযোগকারীর বিরুদ্ধে প্রতিহিংসামূলক আচরণ "
    "(হয়রানি, সুবিধা বঞ্চনা বা ভয় দেখানো) কঠোরভাবে নিষিদ্ধ এবং এটি নিজেই শাস্তিযোগ্য অভিযোগ। "
    "আপনার তথ্য গোপন রাখার চেষ্টা করা হবে।"
)

LAND_FORM_EVIDENCE_CHECKLIST = [
    "দাগ নম্বর ও খতিয়ান সংক্রান্ত কাগজ",
    "ভূমি দলিলের প্রতিলিপি",
    "ছবি বা ভিডিও প্রমাণ",
    "সাক্ষীর বিবৃতি",
    "পুলিশ/প্রশাসনের সাথে যোগাযোগের রসিদ (যদি থাকে)",
]

EMERGENCY_CONTACTS = [
    {"key": "police", "number": "999", "bn": "পুলিশ / জাতীয় জরুরি সেবা"},
    {"key": "women", "number": "109", "bn": "নারী নির্যাতন প্রতিরোধ"},
]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _today() -> date:
    return _now().date()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class ComplaintCreate(BaseModel):
    category: str
    subject: str
    details: str
    accused_admin_id: int | None = None


class ComplaintOut(BaseModel):
    id: int
    complaint_no: str
    complainant_member_id: int
    complainant_name: str | None = None
    category: str
    subject: str
    details: str
    is_land_protection: bool
    form_data: dict | None = None
    has_evidence: bool
    accused_admin_id: int | None = None
    assigned_admin_id: int | None = None
    assigned_admin_name: str | None = None
    status: str
    submitted_at: datetime
    sla_ack_due: date
    sla_update_due: date
    sla_ack: dict
    sla_update: dict
    acknowledged_at: datetime | None = None
    first_update_at: datetime | None = None
    resolved_at: datetime | None = None
    resolution_note: str | None = None
    timeline: list[dict] = []


class AcknowledgePayload(BaseModel):
    note: str | None = None


class AssignPayload(BaseModel):
    admin_id: int
    close_relative_of_accused: bool = False
    override_confirmation: bool = False


class UpdatePayload(BaseModel):
    note: str


class ResolvePayload(BaseModel):
    resolution_note: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _next_complaint_no(db: AsyncSession) -> str:
    year = _today().year
    count = await db.scalar(
        select(func.count(Complaint.id)).where(
            Complaint.complaint_no.like(f"{COMPLAINT_NO_PREFIX}-{year}-%")
        )
    )
    return f"{COMPLAINT_NO_PREFIX}-{year}-{(count or 0) + 1:04d}"


def _complaint_timeline(complaint: Complaint, names: dict[int | None, str]) -> list[dict]:
    events: list[dict] = [
        {
            "event": "submitted",
            "at": complaint.submitted_at.isoformat(),
            "actor": None,
            "note": complaint.subject,
        }
    ]
    if complaint.acknowledged_at:
        events.append({"event": "acknowledged", "at": complaint.acknowledged_at.isoformat(), "actor": None, "note": None})
    if complaint.first_update_at:
        events.append({"event": "first_update", "at": complaint.first_update_at.isoformat(), "actor": None, "note": None})
    for row in complaint.audit_rows:  # type: ignore[attr-defined]
        events.append(
            {
                "event": row.action,
                "at": row.created_at.isoformat(),
                "actor": names.get(row.actor_admin_id),
                "note": row.detail,
            }
        )
    if complaint.resolved_at:
        events.append({"event": "resolved", "at": complaint.resolved_at.isoformat(), "actor": None, "note": complaint.resolution_note})
    if complaint.closed_at:
        events.append({"event": "closed", "at": complaint.closed_at.isoformat(), "actor": None, "note": None})
    return events


async def _complaint_out(db: AsyncSession, complaint: Complaint, include_form: bool = True) -> ComplaintOut:
    rows = (
        await db.execute(
            select(AuditLog)
            .where(AuditLog.entity_type == "complaint", AuditLog.entity_id == str(complaint.id))
            .order_by(AuditLog.created_at)
        )
    ).scalars().all()
    complaint.audit_rows = list(rows)  # type: ignore[attr-defined]
    admin_ids = {row.actor_admin_id for row in rows} | {complaint.assigned_admin_id, complaint.accused_admin_id}
    ids = {i for i in admin_ids if i is not None}
    names: dict[int | None, str] = {}
    if ids:
        names = dict((await db.execute(select(AdminUser.id, AdminUser.name).where(AdminUser.id.in_(ids)))).all())

    form_data = None
    if include_form and complaint.form_data:
        try:
            form_data = json.loads(complaint.form_data)
        except ValueError:
            form_data = None

    complainant_name = None
    if complaint.complainant_member_id:
        member = await db.get(Member, complaint.complainant_member_id)
        complainant_name = member.full_name if member else None

    return ComplaintOut(
        id=complaint.id,
        complaint_no=complaint.complaint_no,
        complainant_member_id=complaint.complainant_member_id,
        complainant_name=complainant_name,
        category=complaint.category,
        subject=complaint.subject,
        details=complaint.details,
        is_land_protection=complaint.is_land_protection,
        form_data=form_data,
        has_evidence=bool(complaint.evidence_path),
        accused_admin_id=complaint.accused_admin_id,
        assigned_admin_id=complaint.assigned_admin_id,
        assigned_admin_name=names.get(complaint.assigned_admin_id),
        status=complaint.status,
        submitted_at=complaint.submitted_at,
        sla_ack_due=complaint.sla_ack_due,
        sla_update_due=complaint.sla_update_due,
        sla_ack=sla_status(due=complaint.sla_ack_due, acknowledged=complaint.acknowledged_at),
        sla_update=sla_status(due=complaint.sla_update_due, acknowledged=complaint.first_update_at),
        acknowledged_at=complaint.acknowledged_at,
        first_update_at=complaint.first_update_at,
        resolved_at=complaint.resolved_at,
        resolution_note=complaint.resolution_note,
        timeline=_complaint_timeline(complaint, names),
    )


async def _load_complaint(db: AsyncSession, complaint_id: int) -> Complaint:
    complaint = (
        await db.execute(select(Complaint).where(Complaint.id == complaint_id))
    ).scalar_one_or_none()
    if complaint is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Complaint not found")
    return complaint


async def _create_complaint(
    db: AsyncSession,
    member: Member,
    *,
    category: str,
    subject: str,
    details: str,
    accused_admin_id: int | None,
    is_land_protection: bool,
    form_data: dict | None,
    evidence_file: UploadFile | None,
) -> Complaint:
    evidence_path = None
    evidence_name = None
    if evidence_file is not None and evidence_file.filename:
        evidence_path = await save_upload_file(evidence_file, f"complaints/{member.id}")
        evidence_name = evidence_file.filename
    complaint = Complaint(
        complaint_no=await _next_complaint_no(db),
        complainant_member_id=member.id,
        category=category,
        subject=subject,
        details=details,
        is_land_protection=is_land_protection,
        form_data=json.dumps(form_data, ensure_ascii=False) if form_data else None,
        evidence_path=evidence_path,
        evidence_name=evidence_name,
        accused_admin_id=accused_admin_id,
        status=COMPLAINT_SUBMITTED,
        submitted_at=_now(),
        sla_ack_due=add_working_days(_today(), COMPLAINT_ACK_WORKING_DAYS),
        sla_update_due=add_working_days(_today(), COMPLAINT_UPDATE_WORKING_DAYS),
    )
    db.add(complaint)
    await db.flush()
    record_audit(
        db,
        actor_admin_id=None,
        action="complaint.submitted",
        entity_type="complaint",
        entity_id=str(complaint.id),
        detail=json.dumps({"complaint_no": complaint.complaint_no, "member_id": member.id}, ensure_ascii=False),
    )
    await db.commit()
    await db.refresh(complaint)
    return complaint


# ---------------------------------------------------------------------------
# Constants endpoint (anti-retaliation notice, emergency contacts, checklist)
# ---------------------------------------------------------------------------


@router.get("/complaints/constants")
async def complaint_constants(_actor: AccountActor = Depends(get_account_actor)) -> dict:
    return {
        "anti_retaliation_notice": ANTI_RETALIATION_NOTICE_BN,
        "land_evidence_checklist": LAND_FORM_EVIDENCE_CHECKLIST,
        "emergency_contacts": EMERGENCY_CONTACTS,
        "categories": [
            {"key": "land", "bn": "জমি সংক্রান্ত"},
            {"key": "service", "bn": "সেবা সংক্রান্ত"},
            {"key": "behaviour", "bn": "আচরণ সংক্রান্ত"},
            {"key": "finance", "bn": "আর্থিক সংক্রান্ত"},
            {"key": "other", "bn": "অন্যান্য"},
        ],
    }


# ---------------------------------------------------------------------------
# Member endpoints
# ---------------------------------------------------------------------------


@router.post("/member/complaints", response_model=ComplaintOut)
async def create_complaint(
    payload: ComplaintCreate,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_member),
) -> ComplaintOut:
    complaint = await _create_complaint(
        db,
        member,
        category=payload.category,
        subject=payload.subject,
        details=payload.details,
        accused_admin_id=payload.accused_admin_id,
        is_land_protection=False,
        form_data=None,
        evidence_file=None,
    )
    return await _complaint_out(db, complaint)


@router.post("/member/complaints/land-protection", response_model=ComplaintOut)
async def create_land_complaint(
    form_data: str = Form(...),
    evidence: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_member),
) -> ComplaintOut:
    """সংযুক্তি-৩ land-protection complaint. The JSON `form_data` must carry the
    mandatory fields plus the non-negotiable disclaimer acknowledgement."""
    try:
        data = json.loads(form_data)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="form_data must be valid JSON"
        )
    required = [
        "complainant_name",
        "land_location",
        "dag_no",
        "khatian_no",
        "accused_party",
        "incident_description",
        "incident_date",
    ]
    missing = [field for field in required if not str(data.get(field) or "").strip()]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Missing required land-protection fields: {', '.join(missing)}",
        )
    if not data.get("disclaimer_acknowledged"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The disclaimer (এটি জিডি/আদালতের বিকল্প নয়) must be acknowledged",
        )
    if not data.get("consent"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Consent is required"
        )
    complaint = await _create_complaint(
        db,
        member,
        category="land_protection",
        subject=f"জমি সুরক্ষা অভিযোগ - {data.get('land_location', '')}",
        details=str(data.get("incident_description", "")),
        accused_admin_id=None,
        is_land_protection=True,
        form_data=data,
        evidence_file=evidence,
    )
    return await _complaint_out(db, complaint)


@router.get("/member/complaints", response_model=list[ComplaintOut])
async def my_complaints(
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_member),
) -> list[ComplaintOut]:
    rows = (
        await db.execute(
            select(Complaint)
            .where(Complaint.complainant_member_id == member.id)
            .order_by(Complaint.submitted_at.desc())
        )
    ).scalars().all()
    return [await _complaint_out(db, c, include_form=False) for c in rows]


@router.get("/member/complaints/{complaint_id}", response_model=ComplaintOut)
async def my_complaint_detail(
    complaint_id: int,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_member),
) -> ComplaintOut:
    complaint = await _load_complaint(db, complaint_id)
    if complaint.complainant_member_id != member.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your complaint")
    return await _complaint_out(db, complaint)


@router.get("/member/complaints/{complaint_id}/evidence/download")
async def download_evidence(
    complaint_id: int,
    db: AsyncSession = Depends(get_db),
    actor: AccountActor = Depends(get_account_actor),
) -> FileResponse:
    """The complainant - or an admin holding complaint.manage - may stream the
    evidence file; the raw /uploads URL stays closed."""
    complaint = await _load_complaint(db, complaint_id)
    is_owner = actor.member is not None and complaint.complainant_member_id == actor.member.id
    is_committee = actor.admin is not None and await can(
        db, actor.admin, "complaint.manage"
    )
    if not (is_owner or is_committee):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your complaint")
    if not complaint.evidence_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No evidence file")
    path = settings.upload_root / complaint.evidence_path
    if not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File missing on disk")
    return FileResponse(path, filename=complaint.evidence_name or "evidence")


@router.get("/member/complaints/{complaint_id}/land-form.pdf")
async def land_form_copy(
    complaint_id: int,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_member),
) -> Response:
    complaint = await _load_complaint(db, complaint_id)
    if complaint.complainant_member_id != member.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your complaint")
    if not complaint.is_land_protection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not a land-protection complaint")
    data = {}
    if complaint.form_data:
        try:
            data = json.loads(complaint.form_data)
        except ValueError:
            data = {}
    pdf_bytes = render_letter(
        title="জমি সুরক্ষা অভিযোগ ফর্ম (সংযুক্তি-৩)",
        ref_no=complaint.complaint_no,
        body_sections=[
            ("অভিযোগকারী", [str(data.get("complainant_name", "-"))]),
            (
                "জমির তথ্য",
                [
                    f"অবস্থান: {data.get('land_location', '-')}",
                    f"দাগ নম্বর: {data.get('dag_no', '-')} | খতিয়ান: {data.get('khatian_no', '-')}",
                ],
            ),
            ("অভিযুক্ত পক্ষ", [str(data.get("accused_party", "-"))]),
            (
                "ঘটনার বিবরণ",
                [f"তারিখ: {data.get('incident_date', '-')}", str(data.get("incident_description", "-"))],
            ),
            ("দাবিত্যাগ", ["এটি জিডি/আদালতের বিকল্প নয়।", ANTI_RETALIATION_NOTICE_BN]),
        ],
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{complaint.complaint_no}-land-form.pdf"'},
    )


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------


@router.get("/admin/complaints", response_model=list[ComplaintOut])
async def admin_list_complaints(
    status_filter: str | None = None,
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_permission("complaint.manage")),
) -> list[ComplaintOut]:
    query = select(Complaint).order_by(Complaint.submitted_at.desc())
    if status_filter:
        if status_filter not in COMPLAINT_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"status must be one of: {', '.join(COMPLAINT_STATUSES)}",
            )
        query = query.where(Complaint.status == status_filter)
    rows = (await db.execute(query)).scalars().all()
    return [await _complaint_out(db, c, include_form=False) for c in rows]


@router.get("/admin/complaints/{complaint_id}", response_model=ComplaintOut)
async def admin_complaint_detail(
    complaint_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_permission("complaint.manage")),
) -> ComplaintOut:
    return await _complaint_out(db, await _load_complaint(db, complaint_id))


@router.post("/admin/complaints/{complaint_id}/acknowledge", response_model=ComplaintOut)
async def acknowledge_complaint(
    complaint_id: int,
    payload: AcknowledgePayload,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("complaint.manage")),
) -> ComplaintOut:
    complaint = await _load_complaint(db, complaint_id)
    if complaint.acknowledged_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already acknowledged")
    complaint.acknowledged_at = _now()
    complaint.status = COMPLAINT_ACKNOWLEDGED
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="complaint.acknowledged",
        entity_type="complaint",
        entity_id=str(complaint.id),
        detail=json.dumps({"sla_ack_due": complaint.sla_ack_due.isoformat(), "note": payload.note}, ensure_ascii=False),
    )
    await db.commit()
    await db.refresh(complaint)
    return await _complaint_out(db, complaint)


@router.post("/admin/complaints/{complaint_id}/assign", response_model=ComplaintOut)
async def assign_complaint(
    complaint_id: int,
    payload: AssignPayload,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("complaint.manage")),
) -> ComplaintOut:
    complaint = await _load_complaint(db, complaint_id)
    assignee = await db.get(AdminUser, payload.admin_id)
    if assignee is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin not found")

    # HARD RULE 1: the assigned admin must not be the accused.
    if complaint.accused_admin_id is not None and payload.admin_id == complaint.accused_admin_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The accused cannot be assigned to investigate their own complaint",
        )
    # HARD RULE 2: flagged close-relative assignment needs a super-admin override.
    if payload.close_relative_of_accused and not payload.override_confirmation:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Assignment blocked: the assignee is flagged as a close relative of the accused. "
            "A super admin must confirm with override_confirmation=true.",
        )
    if payload.close_relative_of_accused and not is_super_admin(admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a super admin may override the close-relative assignment block",
        )

    complaint.assigned_admin_id = payload.admin_id
    if complaint.status in (COMPLAINT_SUBMITTED, COMPLAINT_ACKNOWLEDGED):
        complaint.status = COMPLAINT_INVESTIGATING
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="complaint.assigned",
        entity_type="complaint",
        entity_id=str(complaint.id),
        detail=json.dumps(
            {
                "assigned_admin_id": payload.admin_id,
                "close_relative_of_accused": payload.close_relative_of_accused,
                "override_confirmation": payload.override_confirmation,
            },
            ensure_ascii=False,
        ),
    )
    await db.commit()
    await db.refresh(complaint)
    return await _complaint_out(db, complaint)


@router.post("/admin/complaints/{complaint_id}/update", response_model=ComplaintOut)
async def update_complaint(
    complaint_id: int,
    payload: UpdatePayload,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("complaint.investigate")),
) -> ComplaintOut:
    complaint = await _load_complaint(db, complaint_id)
    if complaint.status in (COMPLAINT_RESOLVED, COMPLAINT_CLOSED, COMPLAINT_REJECTED):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Complaint is closed")
    first_update = complaint.first_update_at is None
    if first_update:
        complaint.first_update_at = _now()
        if complaint.status == COMPLAINT_ACKNOWLEDGED:
            complaint.status = COMPLAINT_INVESTIGATING
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="complaint.updated",
        entity_type="complaint",
        entity_id=str(complaint.id),
        detail=json.dumps({"first_update": first_update, "note": payload.note}, ensure_ascii=False),
    )
    await db.commit()
    await db.refresh(complaint)
    return await _complaint_out(db, complaint)


@router.post("/admin/complaints/{complaint_id}/resolve", response_model=ComplaintOut)
async def resolve_complaint(
    complaint_id: int,
    payload: ResolvePayload,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("complaint.manage")),
) -> ComplaintOut:
    complaint = await _load_complaint(db, complaint_id)
    if complaint.status == COMPLAINT_RESOLVED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already resolved")
    if complaint.first_update_at is None:
        complaint.first_update_at = _now()
    complaint.status = COMPLAINT_RESOLVED
    complaint.resolved_at = _now()
    complaint.resolution_note = payload.resolution_note
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="complaint.resolved",
        entity_type="complaint",
        entity_id=str(complaint.id),
        detail=json.dumps({"resolution_note": payload.resolution_note}, ensure_ascii=False),
    )
    await db.commit()
    await db.refresh(complaint)
    return await _complaint_out(db, complaint)


@router.post("/admin/complaints/{complaint_id}/close", response_model=ComplaintOut)
async def close_complaint(
    complaint_id: int,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("complaint.manage")),
) -> ComplaintOut:
    complaint = await _load_complaint(db, complaint_id)
    if complaint.status != COMPLAINT_RESOLVED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Only a resolved complaint can be closed"
        )
    complaint.status = COMPLAINT_CLOSED
    complaint.closed_at = _now()
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="complaint.closed",
        entity_type="complaint",
        entity_id=str(complaint.id),
        detail=json.dumps({"from": COMPLAINT_RESOLVED, "to": COMPLAINT_CLOSED}, ensure_ascii=False),
    )
    await db.commit()
    await db.refresh(complaint)
    return await _complaint_out(db, complaint)


@router.post("/admin/complaints/{complaint_id}/reject", response_model=ComplaintOut)
async def reject_complaint(
    complaint_id: int,
    payload: ResolvePayload,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("complaint.manage")),
) -> ComplaintOut:
    complaint = await _load_complaint(db, complaint_id)
    if complaint.status in (COMPLAINT_RESOLVED, COMPLAINT_CLOSED):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Complaint already closed")
    complaint.status = COMPLAINT_REJECTED
    complaint.resolution_note = payload.resolution_note
    complaint.resolved_at = _now()
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="complaint.rejected",
        entity_type="complaint",
        entity_id=str(complaint.id),
        detail=json.dumps({"reason": payload.resolution_note}, ensure_ascii=False),
    )
    await db.commit()
    await db.refresh(complaint)
    return await _complaint_out(db, complaint)


@router.get("/admin/complaints/{complaint_id}/letter.pdf")
async def complaint_letter_pdf(
    complaint_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_permission("complaint.manage")),
) -> Response:
    complaint = await _load_complaint(db, complaint_id)
    if complaint.status in (COMPLAINT_RESOLVED, COMPLAINT_CLOSED):
        title = "অভিযোগ নিষ্পত্তি সনদ"
        body = [
            ("বিষয়: অভিযোগ নিষ্পত্তি", []),
            (
                "বিস্তারিত",
                [
                    f"অভিযোগ নম্বর {complaint.complaint_no} নিষ্পত্তি হয়েছে।",
                    f"নিষ্পত্তির বিবরণ: {complaint.resolution_note or '-'}",
                ],
            ),
            ("দাবিত্যাগ", [ANTI_RETALIATION_NOTICE_BN]),
        ]
    else:
        title = "অভিযোগ স্বীকৃতিপত্র"
        body = [
            ("বিষয়: অভিযোগ গৃহীত হয়েছে", []),
            (
                "বিস্তারিত",
                [
                    f"আপনার অভিযোগ নম্বর {complaint.complaint_no} গৃহীত হয়েছে।",
                    f"স্বীকৃতির স্লা সময়সীমা: {complaint.sla_ack_due.isoformat()} ({COMPLAINT_ACK_WORKING_DAYS} কার্যদিবস)।",
                    f"প্রথম আপডেটের সময়সীমা: {complaint.sla_update_due.isoformat()} ({COMPLAINT_UPDATE_WORKING_DAYS} কার্যদিবস)।",
                ],
            ),
            ("প্রতিহিংসা বিরোধী ঘোষণা", [ANTI_RETALIATION_NOTICE_BN]),
        ]
    pdf_bytes = render_letter(title=title, ref_no=complaint.complaint_no, body_sections=body)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{complaint.complaint_no}-letter.pdf"'},
    )


# ---------------------------------------------------------------------------
# Service standards (সেবা মান) with live performance
# ---------------------------------------------------------------------------


@router.get("/governance/service-standard")
async def service_standard(
    db: AsyncSession = Depends(get_db),
    _actor: AccountActor = Depends(get_account_actor),
) -> dict:
    """Published SLAs plus live met/performance figures computed from real
    records (membership applications and complaints)."""
    from app.models.membership_appeal import MembershipApplication

    live_membership: dict | None = None
    application_rows = (
        await db.execute(
            select(MembershipApplication.reviewed_at, MembershipApplication.submitted_at).where(
                MembershipApplication.reviewed_at.is_not(None)
            )
        )
    ).all()
    if application_rows:
        met = 0
        total_days = 0
        for reviewed_at, submitted_at in application_rows:
            days = working_days_between(submitted_at.date(), reviewed_at.date())
            total_days += max(0, days)
            if reviewed_at.date() <= add_working_days(submitted_at.date(), MEMBERSHIP_SLA_WORKING_DAYS):
                met += 1
        live_membership = {
            "total": len(application_rows),
            "met": met,
            "met_pct": round(100.0 * met / len(application_rows), 1),
            "avg_working_days": round(total_days / len(application_rows), 1),
        }

    async def _complaint_live(column, due_column) -> dict | None:
        rows = (
            await db.execute(select(due_column, column).where(column.is_not(None)))
        ).all()
        if not rows:
            return None
        met = sum(1 for due, done in rows if done.date() <= due)
        return {
            "total": len(rows),
            "met": met,
            "met_pct": round(100.0 * met / len(rows), 1),
        }

    live_ack = await _complaint_live(Complaint.acknowledged_at, Complaint.sla_ack_due)
    live_update = await _complaint_live(Complaint.first_update_at, Complaint.sla_update_due)
    return {
        "anti_retaliation_notice": ANTI_RETALIATION_NOTICE_BN,
        "standards": [
            {
                "key": "membership_review",
                "bn": "সদস্যপদের আবেদন পর্যালোচনা",
                "target": f"{MEMBERSHIP_SLA_WORKING_DAYS} কার্যদিবস",
                "live": live_membership,
            },
            {
                "key": "complaint_acknowledgement",
                "bn": "অভিযোগ স্বীকৃতি",
                "target": f"{COMPLAINT_ACK_WORKING_DAYS} কার্যদিবস",
                "live": live_ack,
            },
            {
                "key": "complaint_first_update",
                "bn": "অভিযোগের প্রথম আপডেট",
                "target": f"{COMPLAINT_UPDATE_WORKING_DAYS} কার্যদিবস",
                "live": live_update,
            },
            {
                "key": "petition_response",
                "bn": "আবেদন-নিবেদনের জবাব",
                "target": f"{PETITION_RESPONSE_DAYS} দিন",
                "live": None,
            },
            {
                "key": "appeal_window",
                "bn": "আপিলের সময়সীমা",
                "target": f"{APPEAL_WINDOW_DAYS} দিন",
                "live": None,
            },
        ],
    }
