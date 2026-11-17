"""Rejected applicant self-service: read the rejection, correct the same
application record, and resubmit it for review (unlimited rounds).

Every route requires the limited ``applicant`` session (see
``get_current_applicant``); members and admins are refused.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_current_applicant
from app.db.session import get_db
from app.models.member import Member, MemberStatus
from app.models.property import Property
from app.schemas.applicant import ApplicantApplicationOut, ResubmitResponse
from app.schemas.member import ApplicationReviewOut, MemberDetail
from app.schemas.submission import SubmissionPayload
from app.services.admin_notifications import notify_admins_new_application
from app.services.applicant_access import (
    CORRECTION_FIELDS,
    resubmission_received_email_body,
    review_history,
)
from app.services.application_form import (
    _has_file,
    _reject_duplicate_submission,
    _unprocessable,
    build_nominees,
    build_property,
    ensure_doc_file_limit,
    member_field_values,
    monthly_subscription_for,
    parse_submission_payload,
    resolve_application,
    save_document_files,
)
from app.services.audit import record_audit
from app.services.email import send_email
from app.services.normalization import normalize_email, normalize_mobile, normalize_nid
from app.services.payment_accounts import resolve_for_submission
from app.services.status_transition import claim_status_transition
from app.services.storage import save_upload_file

router = APIRouter(prefix="/applicant", tags=["applicant"])

_DUPLICATE_IDENTIFIER = HTTPException(
    status_code=status.HTTP_409_CONFLICT,
    detail={
        "success": False,
        "code": "DUPLICATE_IDENTIFIER",
        "message": "This NID, mobile or email is already used by another application.",
    },
)


_APPLICATION_LOCKED = HTTPException(
    status_code=status.HTTP_409_CONFLICT,
    detail={
        "success": False,
        "code": "APPLICATION_LOCKED",
        "message": "The application is under review and cannot be changed now.",
    },
)


def _ensure_editable(member: Member) -> None:
    """Only a rejected application can change; once resubmitted it is locked
    until the committee decides again."""
    if member.status != MemberStatus.REJECTED:
        raise _APPLICATION_LOCKED


async def _application_view(db: AsyncSession, member: Member) -> ApplicantApplicationOut:
    reviews = [ApplicationReviewOut.model_validate(r) for r in await review_history(db, member.id)]
    latest_rejection = next((r for r in reversed(reviews) if r.decision == "rejected"), None)
    return ApplicantApplicationOut(
        application=MemberDetail.model_validate(member),
        can_edit=member.status == MemberStatus.REJECTED,
        rejection_reason=member.rejection_reason,
        correction_fields=latest_rejection.correction_fields if latest_rejection else [],
        available_correction_fields=list(CORRECTION_FIELDS),
        reviews=reviews,
    )


@router.get("/application", response_model=ApplicantApplicationOut)
async def get_my_application(
    member: Member = Depends(get_current_applicant),
    db: AsyncSession = Depends(get_db),
) -> ApplicantApplicationOut:
    return await _application_view(db, member)


async def _payment_snapshot(member: Member, data: SubmissionPayload, db: AsyncSession) -> str | None:
    """Keep the stored snapshot when the payment account did not change, so a
    since-deactivated account never blocks an unrelated correction."""
    unchanged = (
        data.payment_account_id == member.payment_account_id
        and data.payment_method == member.payment_method
    )
    if unchanged:
        return member.payment_account_snapshot
    method_kind = "bank" if data.payment_method.strip() == "bank" else "mfs"
    _account, snapshot = await resolve_for_submission(db, data.payment_account_id, method_kind)
    return snapshot


def _kept_document_paths(member: Member) -> frozenset[str]:
    return frozenset(
        doc.file_path
        for prop in member.properties
        for doc in prop.applicable_docs
        if doc.file_path
    )


async def _commit_or_conflict(db: AsyncSession) -> None:
    """The partial unique indexes are the last guard against a collision
    that slipped past the duplicate check."""
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise _DUPLICATE_IDENTIFIER from exc


@router.put("/application", response_model=ApplicantApplicationOut)
async def update_my_application(
    payload: str = Form(...),
    member_photo: UploadFile | None = File(None),
    receipt_photo: UploadFile | None = File(None),
    doc_files: list[UploadFile] = File(default=[]),
    member: Member = Depends(get_current_applicant),
    db: AsyncSession = Depends(get_db),
) -> ApplicantApplicationOut:
    """Replace the application's contents in place (same record, same id).
    Same payload contract as POST /submissions; files are optional - a
    document slot may keep its stored file via `existing_file_path`."""
    _ensure_editable(member)
    ensure_doc_file_limit(doc_files)
    data = parse_submission_payload(payload)
    if not _has_file(member_photo) and not member.member_photo_path:
        raise _unprocessable("PHOTO_REQUIRED", "A member photo is required.")
    # Validation and saving must agree on which slots keep a stored file,
    # otherwise uploads shift slots and the proof check can be bypassed.
    kept_paths = _kept_document_paths(member)
    resolved = await resolve_application(db, data, doc_files, kept_paths=kept_paths)

    nid = normalize_nid(data.nid)
    mobile = normalize_mobile(data.mobile)
    email = normalize_email(data.email)
    # Always re-checked: the corrected identifiers must not collide with any
    # other live application or member.
    await _reject_duplicate_submission(db, nid, mobile, email, exclude_member_id=member.id)

    snapshot = await _payment_snapshot(member, data, db)
    member_dir = f"member_{member.id}"

    # Disk writes first, then the object graph (same order as submissions).
    if _has_file(member_photo):
        member.member_photo_path = await save_upload_file(member_photo, f"photos/{member_dir}")
    if _has_file(receipt_photo):
        member.receipt_photo_path = await save_upload_file(receipt_photo, f"receipts/{member_dir}")
    doc_paths = await save_document_files(data, doc_files, member_dir, kept_paths=kept_paths)

    values = member_field_values(data, resolved, nid=nid, mobile=mobile, email=email)
    for field, value in values.items():
        setattr(member, field, value)
    member.payment_account_snapshot = snapshot
    member.subscription = await monthly_subscription_for(db, data)
    member.properties = [
        build_property(property_in, paths, dag_unknown)
        for property_in, paths, dag_unknown in zip(
            data.properties, doc_paths, resolved.dag_unknown_flags, strict=True
        )
    ]
    member.nominees = build_nominees(data)
    record_audit(
        db,
        actor_admin_id=None,
        action="member.applicant_edit",
        entity_type="member",
        entity_id=str(member.id),
        detail=f"round {(member.resubmission_count or 0) + 1}",
    )
    await _commit_or_conflict(db)
    refreshed = await _load_application(db, member.id)
    return await _application_view(db, refreshed)


async def _load_application(db: AsyncSession, member_pk: int) -> Member:
    """Reload with properties/nominees after the commit replaced them."""
    result = await db.execute(
        select(Member)
        .where(Member.id == member_pk)
        .options(
            selectinload(Member.properties).selectinload(Property.co_owners),
            selectinload(Member.properties).selectinload(Property.applicable_docs),
            selectinload(Member.nominees),
        )
        .execution_options(populate_existing=True)
    )
    return result.scalar_one()


@router.post("/application/resubmit", response_model=ResubmitResponse)
async def resubmit_my_application(
    background_tasks: BackgroundTasks,
    member: Member = Depends(get_current_applicant),
    db: AsyncSession = Depends(get_db),
) -> ResubmitResponse:
    """Send the corrected application back to the review queue."""
    _ensure_editable(member)
    # Another record may have taken an identifier since the last save; the
    # queue must never hold two live applications for one person.
    await _reject_duplicate_submission(
        db, member.nid, member.mobile, member.email, exclude_member_id=member.id
    )
    # Atomic REJECTED -> PENDING: a double click or two tabs resubmitting at
    # once yields one round (one audit row, one set of emails), not two.
    await claim_status_transition(
        db, member, MemberStatus.PENDING, conflict=_APPLICATION_LOCKED
    )
    member.resubmission_count = (member.resubmission_count or 0) + 1
    member.resubmitted_at = datetime.now(timezone.utc)
    member.notification_status = None
    record_audit(
        db,
        actor_admin_id=None,
        action="member.applicant_resubmit",
        entity_type="member",
        entity_id=str(member.id),
        detail=f"resubmission #{member.resubmission_count}",
    )
    await _commit_or_conflict(db)

    background_tasks.add_task(
        notify_admins_new_application,
        kind=f"membership resubmission #{member.resubmission_count}",
        applicant_name=member.full_name,
        mobile=member.mobile or "",
        reference=str(member.id),
        review_path=f"/submissions/{member.id}",
    )
    background_tasks.add_task(
        send_email,
        to=member.email,
        subject="উত্তর কাউন্দিয়া আবাসন মালিক কল্যাণ সোসাইটি - আবেদন পুনরায় জমা হয়েছে",
        html_body=resubmission_received_email_body(member.full_name),
    )
    return ResubmitResponse(status=member.status, resubmission_count=member.resubmission_count)
