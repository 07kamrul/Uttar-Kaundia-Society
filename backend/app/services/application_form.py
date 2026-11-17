"""Shared rules for a membership application form.

Used by the public submission (``POST /submissions``) and by a rejected
applicant correcting the same record (``PUT /applicant/application``), so
both paths validate and store exactly the same way.
"""

import json
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation

from fastapi import HTTPException, UploadFile, status
from pydantic import ValidationError
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import CONSENT_VERSION
from app.core.feature_flags import is_enabled
from app.models.credential import MemberCredential
from app.models.fee_settings import FeeSetting
from app.models.member import Member, MemberStatus
from app.models.nominee import Nominee
from app.models.property import ApplicableDoc, CoOwner, Property
from app.schemas.submission import SubmissionPayload
from app.services.property_duplicates import in_submission_duplicates
from app.services.fee_calculation import calculate_monthly_subscription
from app.services.storage import save_upload_file, slugify_path_segment
from app.services.normalization import (
    mobile_lookup_variants,
    phone_tail_digits,
    same_phone,
)

# Statuses that always block another application with the same identifier.
# A plain REJECTED row (no correction login) does not: that applicant may
# re-apply. The partial unique indexes mirror this tuple.
_BLOCKING_STATUSES = (MemberStatus.PENDING, MemberStatus.APPROVED)

# Trailing digits compared when looking for non-canonically stored phones.
_PHONE_TAIL_LENGTH = 9

# Pseudo-status for a rejected applicant who holds a correction login: they
# must log in and fix that same record instead of filing a new one.
_REJECTED_WITH_LOGIN = "rejected_with_login"

_DUPLICATE_ERRORS: tuple[tuple[object, str, str], ...] = (
    (
        MemberStatus.APPROVED,
        "ALREADY_REGISTERED",
        "You are already registered as a member. Please login.",
    ),
    (
        MemberStatus.PENDING,
        "APPLICATION_PENDING",
        "Your application is pending. Please wait for confirmation.",
    ),
    (
        _REJECTED_WITH_LOGIN,
        "REJECTED_CAN_RESUBMIT",
        "Your earlier application needs corrections. Please log in with your email "
        "to correct and resubmit it.",
    ),
)


def _row_kind(row) -> object:
    if row.status == MemberStatus.REJECTED:
        return _REJECTED_WITH_LOGIN
    return row.status


async def _reject_duplicate_submission(
    db: AsyncSession,
    nid: str,
    mobile: str,
    email: str,
    *,
    exclude_member_id: int | None = None,
) -> None:
    """Raise a 409 if another live application already matches any identifier.

    "Live" means PENDING, APPROVED, or REJECTED with a correction login (that
    record is still being corrected). `exclude_member_id` skips the record an
    applicant is editing. The code tells the frontend which popup to show.
    This does not fully close the race between two simultaneous submissions -
    the partial unique indexes from migration d4e6f8a0b2c4 are the safety net.
    """
    # Stored values come in several forms (E.164, legacy "01712345678", or
    # hand-typed with separators until the phone migration has run), so besides
    # the exact variants the SQL also pulls rows whose digits end the same way;
    # each candidate is then confirmed by comparing normalised E.164 values.
    tail = phone_tail_digits(mobile, _PHONE_TAIL_LENGTH)
    statement = (
        select(Member.status, Member.nid, Member.email, Member.mobile)
        .outerjoin(MemberCredential, MemberCredential.member_id == Member.id)
        .where(
            or_(
                Member.status.in_(_BLOCKING_STATUSES),
                and_(
                    Member.status == MemberStatus.REJECTED,
                    Member.member_id.is_(None),
                    MemberCredential.id.is_not(None),
                ),
            ),
            or_(
                Member.nid == nid,
                Member.mobile.in_(mobile_lookup_variants(mobile)),
                Member.mobile.like(f"%{tail}"),
                Member.email == email,
            ),
        )
    )
    if exclude_member_id is not None:
        statement = statement.where(Member.id != exclude_member_id)
    result = await db.execute(statement)
    matched = {
        _row_kind(row)
        for row in result.all()
        if row.nid == nid
        or row.email == email
        or row.mobile in mobile_lookup_variants(mobile)
        or same_phone(row.mobile, mobile)
    }
    for kind, code, message in _DUPLICATE_ERRORS:
        if kind in matched:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"success": False, "code": code, "message": message},
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


def _doc_has_file(doc_in, files, allow_existing: bool) -> bool:
    """A kept file (applicant edit) consumes no upload; otherwise the next
    uploaded file belongs to this document slot."""
    if allow_existing and doc_in.existing_file_path:
        return True
    return _has_file(next(files, None))


def _validate_proofs(
    data: SubmissionPayload, doc_files: list[UploadFile], *, allow_existing: bool = False
) -> None:
    """Every property needs at least one proof file. Files are matched to
    document slots the same way the routes walk them when saving."""
    files = iter(doc_files)
    for property_in in data.properties:
        provided = sum(
            1
            for doc_in in property_in.applicable_docs
            if _doc_has_file(doc_in, files, allow_existing)
        )
        if provided == 0:
            raise _unprocessable(
                "PROPERTY_PROOF_REQUIRED", "Upload at least one ownership document per property."
            )




def parse_submission_payload(raw: str) -> SubmissionPayload:
    """The multipart 'payload' field as a validated SubmissionPayload."""
    try:
        return SubmissionPayload.model_validate(json.loads(raw))
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"success": False, "code": "INVALID_PAYLOAD", "message": "Payload is not valid JSON."},
        ) from exc
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=_validation_error_detail(exc)
        ) from exc


def ensure_doc_file_limit(doc_files: list[UploadFile]) -> None:
    if len(doc_files) > MAX_SUBMISSION_DOC_FILES:
        # Bound how much disk one request can fill.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "success": False,
                "code": "TOO_MANY_FILES",
                "message": f"At most {MAX_SUBMISSION_DOC_FILES} documents per submission.",
            },
        )


@dataclass(frozen=True)
class ResolvedApplication:
    """Flag-dependent values derived once from a validated payload."""

    occupation: str
    nationality: str
    is_abroad: bool
    dag_unknown_flags: tuple[bool, ...]


async def resolve_application(
    db: AsyncSession,
    data: SubmissionPayload,
    doc_files: list[UploadFile],
    *,
    allow_existing_files: bool = False,
) -> ResolvedApplication:
    """Apply every feature-flag dependent rule; raises 422 on the first failure."""
    rules = await _FlagRules.load(db)
    occupation = _resolve_occupation(data, rules)
    nationality = _resolve_nationality(data, rules)
    is_abroad = rules.abroad_address and data.current_address_abroad
    if is_abroad:
        _validate_abroad_address(data)
    dag_flags = tuple(_resolve_dag_unknown(p, rules) for p in data.properties)
    duplicate_keys = in_submission_duplicates(
        [
            (p.dag_no_rs, p.dag_no_cs, p.land_quantity)
            for p, unknown in zip(data.properties, dag_flags, strict=True)
            if not unknown
        ]
    )
    if duplicate_keys:
        raise _unprocessable(
            "DUPLICATE_PROPERTY",
            "The same plot (dag numbers and land quantity) is entered more than once.",
        )
    if rules.min_one_proof:
        _validate_proofs(data, doc_files, allow_existing=allow_existing_files)
    return ResolvedApplication(
        occupation=occupation,
        nationality=nationality,
        is_abroad=bool(is_abroad),
        dag_unknown_flags=dag_flags,
    )


def _address_values(prefix: str, address) -> dict:
    keys = ("house", "road", "post_office", "upazila", "district", "division")
    return {f"{prefix}_{key}": getattr(address, key) if address else None for key in keys}


def member_field_values(
    data: SubmissionPayload,
    resolved: ResolvedApplication,
    *,
    nid: str,
    mobile: str,
    email: str,
) -> dict:
    """Applicant-entered Member columns (no status, fees, files or review
    fields). Identifiers must already be normalised by the caller."""
    abroad = resolved.is_abroad
    return {
        "full_name": data.full_name,
        "father_or_husband": data.father_or_husband,
        "mother": data.mother,
        "dob": data.dob,
        "nationality": resolved.nationality,
        "occupation": resolved.occupation,
        "nid": nid,
        "mobile": mobile,
        "gender": data.gender,
        "email": email,
        **_address_values("permanent", data.permanent_address),
        **_address_values("current", data.current_address),
        "has_whatsapp": data.has_whatsapp,
        "current_address_abroad": abroad,
        "current_country": data.current_country.strip().upper() if abroad else None,
        "current_city": data.current_city.strip() if abroad else None,
        "current_address_text": data.current_address_text.strip() if abroad else None,
        "consent_version": data.consent_version or CONSENT_VERSION,
        "urgent_contact_name": data.urgent_contact_name,
        "urgent_contact_relation": data.urgent_contact_relation,
        "urgent_contact_mobile": data.urgent_contact_mobile,
        "urgent_contact_address": data.urgent_contact_address,
        "receipt_no": data.receipt_no,
        "payment_method": data.payment_method,
        "payment_account_id": data.payment_account_id,
        "member_signature": data.member_signature,
        "submission_date": data.submission_date,
    }


async def monthly_subscription_for(db: AsyncSession, data: SubmissionPayload) -> str:
    """Server-side subscription from the tiered rates active today; the
    client-sent amount is never trusted."""
    quote = await calculate_monthly_subscription(db, _total_share_quantity(data), date.today())
    return str(quote.total)


def build_property(property_in, doc_paths: list[str | None], dag_unknown: bool) -> Property:
    return Property(
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
            for doc_in, file_path in zip(property_in.applicable_docs, doc_paths, strict=True)
        ],
    )


def build_nominees(data: SubmissionPayload) -> list[Nominee]:
    return [
        Nominee(name=n.name, relation=n.relation, mobile=n.mobile, address=n.address)
        for n in data.nominees
    ]


async def save_document_files(
    data: SubmissionPayload,
    doc_files: list[UploadFile],
    member_dir: str,
    *,
    kept_paths: frozenset[str] = frozenset(),
) -> list[list[str | None]]:
    """Store uploaded proof files, one path per document slot.

    A slot that names an `existing_file_path` from `kept_paths` (the
    applicant's own stored documents) keeps that file and consumes no upload;
    any other existing path is ignored - a request can never point a slot at
    someone else's file.
    """
    file_iter = iter(doc_files)
    doc_paths: list[list[str | None]] = []
    for property_in in data.properties:
        paths: list[str | None] = []
        for doc_in in property_in.applicable_docs:
            if doc_in.existing_file_path and doc_in.existing_file_path in kept_paths:
                paths.append(doc_in.existing_file_path)
                continue
            doc_file = next(file_iter, None)
            file_path = None
            if doc_file is not None and doc_file.filename:
                # Folder name is an ASCII slug; the Bengali display label stays
                # in `ApplicableDoc.doc_type` only.
                doc_type_dir = slugify_path_segment(doc_in.doc_type)
                file_path = await save_upload_file(doc_file, f"documents/{member_dir}/{doc_type_dir}")
            paths.append(file_path)
        doc_paths.append(paths)
    return doc_paths
