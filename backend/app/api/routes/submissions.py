from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, UploadFile, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.member import Member, MemberStatus
from app.schemas.member import SubmissionCreateResponse
from app.services.admin_notifications import notify_admins_new_application
from app.services.payment_accounts import resolve_for_submission
from app.services.normalization import normalize_email, normalize_mobile, normalize_nid
from app.services.storage import save_upload_file
from app.services.application_form import (  # noqa: F401 - re-exported
    _BLOCKING_STATUSES,
    MAX_SUBMISSION_DOC_FILES,
    _FlagRules,
    _has_file,
    _reject_duplicate_submission,
    _resolve_dag_unknown,
    _resolve_nationality,
    _resolve_occupation,
    _total_share_quantity,
    _unprocessable,
    _validate_abroad_address,
    _validate_proofs,
    _validation_error_detail,
    build_nominees,
    build_property,
    ensure_doc_file_limit,
    member_field_values,
    monthly_subscription_for,
    parse_submission_payload,
    resolve_active_fee,
    resolve_application,
    save_document_files,
)

router = APIRouter(tags=["submissions"])



@router.post("/submissions", response_model=SubmissionCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_submission(
    background_tasks: BackgroundTasks,
    payload: str = Form(...),
    member_photo: UploadFile | None = File(None),
    member_photo_camel: UploadFile | None = File(None, alias="memberPhoto"),
    receipt_photo: UploadFile | None = File(None),
    doc_files: list[UploadFile] = File(default=[]),
    db: AsyncSession = Depends(get_db),
) -> SubmissionCreateResponse:
    """Public endpoint. Accepts multipart/form-data with:
    - 'payload': JSON string matching SubmissionPayload, where each
      applicable_doc entry's order corresponds to the order of files in
      'doc_files' flattened across properties in order.
    - 'member_photo': optional file upload for the member's photo.
    - 'receipt_photo': optional file upload for the money receipt image.
    - 'doc_files': ordered list of files for each property's applicable_docs.
    """
    ensure_doc_file_limit(doc_files)
    data = parse_submission_payload(payload)

    member_photo = member_photo if _has_file(member_photo) else member_photo_camel
    if not _has_file(member_photo):
        raise _unprocessable("PHOTO_REQUIRED", "A member photo is required.")

    resolved = await resolve_application(db, data, doc_files)

    normalized_nid = normalize_nid(data.nid)
    normalized_mobile = normalize_mobile(data.mobile)
    normalized_email = normalize_email(data.email)

    # The claimed account must exist, match the chosen method's type and be
    # active right now; the snapshot stored below keeps history correct if it
    # is later edited or deactivated.
    _account, payment_account_snapshot = await resolve_for_submission(
        db, data.payment_account_id, "bank" if data.payment_method.strip() == "bank" else "mfs"
    )

    await _reject_duplicate_submission(db, normalized_nid, normalized_mobile, normalized_email)

    member = Member(
        status=MemberStatus.PENDING,
        **member_field_values(
            data, resolved, nid=normalized_nid, mobile=normalized_mobile, email=normalized_email
        ),
        payment_account_snapshot=payment_account_snapshot,
        # Client-sent admission_fee / subscription are deliberately ignored —
        # both are re-resolved server-side from the active fee settings.
        admission_fee=await resolve_active_fee(db, "admission_fee", date.today()),
        subscription=await monthly_subscription_for(db, data),
        # Seed both collections so they read as already-loaded: after the
        # flush below the member is persistent, and appending to an unloaded
        # collection on a persistent object would trigger a lazy SELECT.
        properties=[],
        nominees=[],
    )

    db.add(member)
    try:
        await db.flush()  # assigns member.id, used to namespace uploaded files below
    except IntegrityError:
        # Two identical submissions raced past the query in
        # _reject_duplicate_submission and both reached the insert; the
        # partial unique indexes from migration d4e6f8a0b2c4 caught it here.
        await db.rollback()
        await _reject_duplicate_submission(db, normalized_nid, normalized_mobile, normalized_email)
        raise  # the identifiers now match a REJECTED-only row - genuinely not a duplicate, surface the DB error

    member_dir = f"member_{member.id}"

    # --- Pass 1: every disk write, with no database work interleaved. -------
    # Uploads can be up to 10 MB each; doing them before the object graph is
    # built keeps the connection checked out for the shortest window that the
    # `member_{id}` folder naming allows, and keeps all blocking file work out
    # of the insert path.
    member.member_photo_path = await save_upload_file(member_photo, f"photos/{member_dir}")

    if receipt_photo is not None and receipt_photo.filename:
        member.receipt_photo_path = await save_upload_file(receipt_photo, f"receipts/{member_dir}")

    doc_paths = await save_document_files(data, doc_files, member_dir)

    # --- Pass 2: build the whole object graph, then commit once. ------------
    # Children hang off their parents' relationships instead of carrying a
    # pre-assigned foreign key, so SQLAlchemy orders the inserts itself.
    member.properties.extend(
        build_property(property_in, paths, dag_unknown)
        for property_in, paths, dag_unknown in zip(
            data.properties, doc_paths, resolved.dag_unknown_flags, strict=True
        )
    )
    member.nominees.extend(build_nominees(data))

    await db.commit()
    # Sent after the response so a slow SMTP server never delays or fails
    # the applicant's submission.
    background_tasks.add_task(
        notify_admins_new_application,
        kind="membership registration",
        applicant_name=member.full_name,
        mobile=member.mobile or "",
        reference=str(member.id),
        review_path=f"/submissions/{member.id}",
    )
    # No refresh: `id` is populated by the flush, `status` comes from a
    # Python-side default, and expire_on_commit=False leaves both intact.
    return SubmissionCreateResponse(id=member.id, status=member.status)
