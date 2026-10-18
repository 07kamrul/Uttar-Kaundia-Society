import json
from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import ValidationError
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from decimal import Decimal, InvalidOperation

from app.core.constants import CONSENT_VERSION
from app.core.feature_flags import is_enabled
from app.db.session import get_db
from app.models.fee_settings import FeeSetting
from app.models.member import Member, MemberStatus
from app.models.property import ApplicableDoc, CoOwner, Property
from app.models.nominee import Nominee
from app.schemas.member import SubmissionCreateResponse
from app.schemas.submission import SubmissionPayload
from app.services.fee_calculation import calculate_monthly_subscription
from app.services.payment_accounts import resolve_for_submission
from app.services.normalization import (
    mobile_lookup_variants,
    normalize_email,
    normalize_mobile,
    normalize_nid,
    phone_tail_digits,
    same_phone,
)
from app.services.storage import save_upload_file, slugify_path_segment

router = APIRouter(tags=["submissions"])

# Statuses that still block a resubmission with the same identifier. A
# REJECTED applicant is free to re-apply.
_BLOCKING_STATUSES = (MemberStatus.PENDING, MemberStatus.APPROVED)

# Trailing digits compared when looking for non-canonically stored phones.
_PHONE_TAIL_LENGTH = 9


async def _reject_duplicate_submission(
    db: AsyncSession, nid: str, mobile: str, email: str
) -> None:
    """Raise a 409 if a non-rejected member already matches any identifier.

    This is the user-facing check: it distinguishes PENDING from APPROVED so
    the frontend can show the right popup. It does not fully close the race
    between two simultaneous submissions - the partial unique indexes added
    in migration d4e6f8a0b2c4 are the actual safety net for that, and
    `create_submission` catches the resulting IntegrityError as a fallback.
    """
    # Stored values come in several forms (E.164, legacy "01712345678", or
    # hand-typed with separators until the phone migration has run), so besides
    # the exact variants the SQL also pulls rows whose digits end the same way;
    # each candidate is then confirmed by comparing normalised E.164 values.
    tail = phone_tail_digits(mobile, _PHONE_TAIL_LENGTH)
    result = await db.execute(
        select(Member.status, Member.nid, Member.email, Member.mobile).where(
            Member.status.in_(_BLOCKING_STATUSES),
            or_(
                Member.nid == nid,
                Member.mobile.in_(mobile_lookup_variants(mobile)),
                Member.mobile.like(f"%{tail}"),
                Member.email == email,
            ),
        )
    )
    matched_statuses = {
        row.status
        for row in result.all()
        if row.nid == nid
        or row.email == email
        or row.mobile in mobile_lookup_variants(mobile)
        or same_phone(row.mobile, mobile)
    }
    if not matched_statuses:
        return
    if MemberStatus.APPROVED in matched_statuses:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "success": False,
                "code": "ALREADY_REGISTERED",
                "message": "You are already registered as a member. Please login.",
            },
        )
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "success": False,
            "code": "APPLICATION_PENDING",
            "message": "Your application is pending. Please wait for confirmation.",
        },
    )


async def resolve_active_fee(db: AsyncSession, key: str, on_date: date) -> str:
    """Active fee-setting value as of `on_date`. The client-sent amount is
    never trusted: the stored fee is always re-resolved here at submit time."""
    # Overlapping active versions can exist (e.g. a backdated new version
    # whose end_date still covers the period of the old one); the latest
    # start_date wins, matching the versioned-settings semantics elsewhere.
    result = await db.execute(
        select(FeeSetting.value)
        .where(
            FeeSetting.key == key,
            FeeSetting.start_date <= on_date,
            or_(FeeSetting.end_date.is_(None), FeeSetting.end_date >= on_date),
        )
        .order_by(FeeSetting.start_date.desc(), FeeSetting.id.desc())
        .limit(1)
    )
    value = result.scalar_one_or_none()
    if value is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "success": False,
                "code": "FEE_NOT_CONFIGURED",
                "message": f"No active fee setting configured for '{key}'",
            },
        )
    return str(value)


def _validation_error_detail(exc: ValidationError) -> dict:
    """Structured 422 body: one entry per failing field so the frontend can
    name the field and jump to its step instead of showing raw Pydantic text."""
    return {
        "success": False,
        "code": "VALIDATION_ERROR",
        "message": "Some fields are invalid.",
        "errors": [
            {
                "field": ".".join(str(part) for part in err["loc"]),
                "code": err["type"],
                "message": err["msg"],
            }
            for err in exc.errors()
        ],
    }


def _total_share_quantity(data: SubmissionPayload) -> Decimal:
    total = Decimal("0")
    for property_in in data.properties:
        try:
            total += Decimal(property_in.my_share_quantity or "0")
        except InvalidOperation:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "success": False,
                    "code": "INVALID_SHARE_QUANTITY",
                    "message": "Invalid land share quantity",
                },
            )
    return total


MAX_SUBMISSION_DOC_FILES = 40

DEFAULT_NATIONALITY = "বাংলাদেশী"
_DOMESTIC_COUNTRY = "BD"


def _unprocessable(code: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail={"success": False, "code": code, "message": message},
    )


def _missing_field_error(field: str) -> HTTPException:
    """Same body shape pydantic produces for a missing required field."""
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail={
            "success": False,
            "code": "VALIDATION_ERROR",
            "message": "Some fields are invalid.",
            "errors": [{"field": field, "code": "missing", "message": "Field required"}],
        },
    )


def _has_file(upload: UploadFile | None) -> bool:
    return upload is not None and bool(upload.filename)


def _is_blank(value: str | None) -> bool:
    return value is None or not value.strip()


class _FlagRules:
    """Flag-dependent registration rules, resolved once per submission."""

    def __init__(self, **flags: bool) -> None:
        self.occupation_optional = flags["reg_occupation_optional"]
        self.hide_nationality = flags["reg_hide_nationality"]
        self.dag_unknown = flags["reg_dag_unknown"]
        self.min_one_proof = flags["reg_min_one_proof"]
        self.abroad_address = flags["reg_abroad_address"]

    @classmethod
    async def load(cls, db: AsyncSession) -> "_FlagRules":
        keys = (
            "reg_occupation_optional",
            "reg_hide_nationality",
            "reg_dag_unknown",
            "reg_min_one_proof",
            "reg_abroad_address",
        )
        return cls(**{key: await is_enabled(db, key) for key in keys})


def _resolve_occupation(data: SubmissionPayload, rules: _FlagRules) -> str:
    if data.occupation is None and not rules.occupation_optional:
        raise _missing_field_error("occupation")
    return data.occupation or ""


def _resolve_nationality(data: SubmissionPayload, rules: _FlagRules) -> str:
    if rules.hide_nationality and _is_blank(data.nationality):
        return DEFAULT_NATIONALITY
    if data.nationality is None:
        raise _missing_field_error("nationality")
    return data.nationality


def _validate_abroad_address(data: SubmissionPayload) -> None:
    country = (data.current_country or "").strip().upper()
    if (
        len(country) != 2
        or not country.isalpha()
        or country == _DOMESTIC_COUNTRY
        or _is_blank(data.current_city)
        or _is_blank(data.current_address_text)
    ):
        raise _unprocessable(
            "ABROAD_ADDRESS_REQUIRED",
            "Country (not Bangladesh), city and address are required for an address abroad.",
        )


def _resolve_dag_unknown(property_in, rules: _FlagRules) -> bool:
    """Whether the property is stored as dag-unknown; rejects an empty dag that
    was not declared unknown when the dag-unknown flow is enabled."""
    if not rules.dag_unknown:
        return False
    has_dag = not (_is_blank(property_in.dag_no_cs) and _is_blank(property_in.dag_no_rs))
    if has_dag:
        return False
    if not property_in.dag_unknown:
        raise _unprocessable("DAG_REQUIRED_FIELD", "Enter the dag number or tick 'I do not know'.")
    return True


def _validate_proofs(data: SubmissionPayload, doc_files: list[UploadFile]) -> None:
    """Every property needs at least one uploaded proof file. Files are matched
    to properties the same way pass 1 of the route walks them."""
    files = iter(doc_files)
    for property_in in data.properties:
        provided = sum(
            1 for _ in property_in.applicable_docs if _has_file(next(files, None))
        )
        if provided == 0:
            raise _unprocessable(
                "PROPERTY_PROOF_REQUIRED", "Upload at least one ownership document per property."
            )


@router.post("/submissions", response_model=SubmissionCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_submission(
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
    if len(doc_files) > MAX_SUBMISSION_DOC_FILES:
        # Anonymous endpoint: bound how much disk one request can fill.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "success": False,
                "code": "TOO_MANY_FILES",
                "message": f"At most {MAX_SUBMISSION_DOC_FILES} documents per submission.",
            },
        )
    try:
        data = SubmissionPayload.model_validate(json.loads(payload))
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"success": False, "code": "INVALID_PAYLOAD", "message": "Payload is not valid JSON."},
        ) from exc
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=_validation_error_detail(exc)
        ) from exc

    member_photo = member_photo if _has_file(member_photo) else member_photo_camel
    if not _has_file(member_photo):
        raise _unprocessable("PHOTO_REQUIRED", "A member photo is required.")

    rules = await _FlagRules.load(db)
    occupation = _resolve_occupation(data, rules)
    nationality = _resolve_nationality(data, rules)
    is_abroad = rules.abroad_address and data.current_address_abroad
    if is_abroad:
        _validate_abroad_address(data)
    dag_unknown_flags = [_resolve_dag_unknown(p, rules) for p in data.properties]
    if rules.min_one_proof:
        _validate_proofs(data, doc_files)

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
        full_name=data.full_name,
        father_or_husband=data.father_or_husband,
        mother=data.mother,
        dob=data.dob,
        nationality=nationality,
        occupation=occupation,
        nid=normalized_nid,
        mobile=normalized_mobile,
        gender=data.gender,
        email=normalized_email,
        permanent_house=data.permanent_address.house if data.permanent_address else None,
        permanent_road=data.permanent_address.road if data.permanent_address else None,
        permanent_post_office=data.permanent_address.post_office if data.permanent_address else None,
        permanent_upazila=data.permanent_address.upazila if data.permanent_address else None,
        permanent_district=data.permanent_address.district if data.permanent_address else None,
        permanent_division=data.permanent_address.division if data.permanent_address else None,
        current_house=data.current_address.house if data.current_address else None,
        current_road=data.current_address.road if data.current_address else None,
        current_post_office=data.current_address.post_office if data.current_address else None,
        current_upazila=data.current_address.upazila if data.current_address else None,
        current_district=data.current_address.district if data.current_address else None,
        current_division=data.current_address.division if data.current_address else None,
        has_whatsapp=data.has_whatsapp,
        current_address_abroad=is_abroad,
        current_country=data.current_country.strip().upper() if is_abroad else None,
        current_city=data.current_city.strip() if is_abroad else None,
        current_address_text=data.current_address_text.strip() if is_abroad else None,
        consent_version=data.consent_version or CONSENT_VERSION,
        urgent_contact_name=data.urgent_contact_name,
        urgent_contact_relation=data.urgent_contact_relation,
        urgent_contact_mobile=data.urgent_contact_mobile,
        urgent_contact_address=data.urgent_contact_address,
        # Client-sent admission_fee is deliberately ignored — the amount
        # stored on the submission is the server-resolved active version.
        admission_fee=await resolve_active_fee(db, "admission_fee", date.today()),
        # Client-sent subscription is deliberately ignored - it is always
        # recomputed from the tiered rates active today and the submitted
        # land share, the same calculation the quote endpoint returns.
        subscription=str(
            (
                await calculate_monthly_subscription(
                    db, _total_share_quantity(data), date.today()
                )
            ).total
        ),
        receipt_no=data.receipt_no,
        payment_method=data.payment_method,
        payment_account_id=data.payment_account_id,
        payment_account_snapshot=payment_account_snapshot,
        member_signature=data.member_signature,
        submission_date=data.submission_date,
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
    if _has_file(member_photo):
        member.member_photo_path = await save_upload_file(member_photo, f"photos/{member_dir}")

    if receipt_photo is not None and receipt_photo.filename:
        member.receipt_photo_path = await save_upload_file(receipt_photo, f"receipts/{member_dir}")

    doc_file_iter = iter(doc_files)
    doc_paths: list[list[str | None]] = []
    for property_in in data.properties:
        paths: list[str | None] = []
        for doc_in in property_in.applicable_docs:
            doc_file = next(doc_file_iter, None)
            file_path = None
            if doc_file is not None and doc_file.filename:
                # Folder name is an ASCII slug; the Bengali display label stays
                # in `ApplicableDoc.doc_type` only.
                doc_type_dir = slugify_path_segment(doc_in.doc_type)
                file_path = await save_upload_file(doc_file, f"documents/{member_dir}/{doc_type_dir}")
            paths.append(file_path)
        doc_paths.append(paths)

    # --- Pass 2: build the whole object graph, then commit once. ------------
    # Children hang off their parents' relationships instead of carrying a
    # pre-assigned foreign key, so SQLAlchemy orders the inserts itself. That
    # removes the old per-property `flush()` - one round-trip per property -
    # in favour of a single flush at commit.
    for property_in, paths, dag_unknown in zip(
        data.properties, doc_paths, dag_unknown_flags, strict=True
    ):
        member.properties.append(
            Property(
                dag_unknown=dag_unknown,
                property_type=property_in.property_type,
                property_type_other=property_in.property_type_other,
                khatian_no=property_in.khatian_no,
                dag_no_cs=property_in.dag_no_cs,
                dag_no_rs=property_in.dag_no_rs,
                holding_number=property_in.holding_number,
                land_quantity=property_in.land_quantity,
                my_share_quantity=property_in.my_share_quantity,
                ownership=property_in.ownership,
                joint_owner_count=property_in.joint_owner_count,
                co_owners=[
                    CoOwner(owner_name=co_owner_in.owner_name, owner_phone=co_owner_in.owner_phone)
                    for co_owner_in in property_in.co_owners
                ],
                applicable_docs=[
                    ApplicableDoc(doc_type=doc_in.doc_type, file_path=file_path)
                    for doc_in, file_path in zip(property_in.applicable_docs, paths, strict=True)
                ],
            )
        )

    for nominee_in in data.nominees:
        member.nominees.append(
            Nominee(
                name=nominee_in.name,
                relation=nominee_in.relation,
                mobile=nominee_in.mobile,
                address=nominee_in.address,
            )
        )

    await db.commit()
    # No refresh: `id` is populated by the flush, `status` comes from a
    # Python-side default, and expire_on_commit=False leaves both intact.
    return SubmissionCreateResponse(id=member.id, status=member.status)
