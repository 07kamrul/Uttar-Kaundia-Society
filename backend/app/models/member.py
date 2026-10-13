import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Index, Integer, String, Text, func, false, true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class MemberStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


# Member class (গঠনতন্ত্র সদস্য শ্রেণি). NULL = not yet classified (legacy rows).
MEMBER_CLASS_FOUNDER = "founder"
MEMBER_CLASS_GENERAL = "general"
MEMBER_CLASS_HONORARY_ASSOCIATE = "honorary_associate"
MEMBER_CLASSES = (MEMBER_CLASS_FOUNDER, MEMBER_CLASS_GENERAL, MEMBER_CLASS_HONORARY_ASSOCIATE)

# Governance status is a *record*, not an auth gate: a suspended member keeps
# their land-info access (get_current_member never checks it) while the
# suspension is visible to governance modules.
GOVERNANCE_STATUS_ACTIVE = "active"
GOVERNANCE_STATUS_SUSPENDED = "suspended"
GOVERNANCE_STATUSES = (GOVERNANCE_STATUS_ACTIVE, GOVERNANCE_STATUS_SUSPENDED)


class Member(Base):
    __tablename__ = "members"
    # Admin lists sort by `created_at DESC` (optionally filtered by `status`);
    # without these the whole table is sorted on every page load.
    __table_args__ = (
        Index("ix_members_created_at", "created_at"),
        Index("ix_members_status_created_at", "status", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_id: Mapped[str | None] = mapped_column(String(32), unique=True, nullable=True, index=True)
    status: Mapped[MemberStatus] = mapped_column(
        Enum(MemberStatus, name="member_status"), default=MemberStatus.PENDING, nullable=False, index=True
    )

    # Member info
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    father_or_husband: Mapped[str] = mapped_column(String(255), nullable=False)
    mother: Mapped[str] = mapped_column(String(255), nullable=False)
    dob: Mapped[str] = mapped_column(String(32), nullable=False)
    nationality: Mapped[str] = mapped_column(String(64), nullable=False)
    occupation: Mapped[str] = mapped_column(String(255), nullable=False)
    nid: Mapped[str] = mapped_column(String(64), nullable=False)
    mobile: Mapped[str] = mapped_column(String(32), nullable=False)
    # Value as originally stored before the E.164 phone migration (or a fix).
    mobile_raw: Mapped[str | None] = mapped_column(String(64), nullable=True)
    gender: Mapped[str] = mapped_column(String(16), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)

    # Address info
    permanent_house: Mapped[str | None] = mapped_column(String(255), nullable=True)
    permanent_road: Mapped[str | None] = mapped_column(String(255), nullable=True)
    permanent_post_office: Mapped[str | None] = mapped_column(String(255), nullable=True)
    permanent_upazila: Mapped[str | None] = mapped_column(String(255), nullable=True)
    permanent_district: Mapped[str | None] = mapped_column(String(255), nullable=True)
    permanent_division: Mapped[str | None] = mapped_column(String(255), nullable=True)
    current_house: Mapped[str | None] = mapped_column(String(255), nullable=True)
    current_road: Mapped[str | None] = mapped_column(String(255), nullable=True)
    current_post_office: Mapped[str | None] = mapped_column(String(255), nullable=True)
    current_upazila: Mapped[str | None] = mapped_column(String(255), nullable=True)
    current_district: Mapped[str | None] = mapped_column(String(255), nullable=True)
    current_division: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Urgent contact
    urgent_contact_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    urgent_contact_relation: Mapped[str | None] = mapped_column(String(128), nullable=True)
    urgent_contact_mobile: Mapped[str | None] = mapped_column(String(32), nullable=True)
    urgent_contact_mobile_raw: Mapped[str | None] = mapped_column(String(64), nullable=True)
    urgent_contact_address: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Payment
    admission_fee: Mapped[str] = mapped_column(String(32), nullable=False)
    subscription: Mapped[str] = mapped_column(String(32), nullable=False)
    receipt_no: Mapped[str] = mapped_column(String(64), nullable=False)
    payment_method: Mapped[str] = mapped_column(String(64), nullable=False)
    receipt_photo_path: Mapped[str | None] = mapped_column(String(512), nullable=True)

    # Signature
    member_signature: Mapped[str | None] = mapped_column(Text, nullable=True)
    submission_date: Mapped[str] = mapped_column(String(32), nullable=False)

    # Contact / address extras (batch 1 registration)
    has_whatsapp: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    current_address_abroad: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=false(), nullable=False
    )
    current_country: Mapped[str | None] = mapped_column(String(2), nullable=True)
    current_city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    current_address_text: Mapped[str | None] = mapped_column(String(500), nullable=True)
    consent_version: Mapped[str | None] = mapped_column(String(16), nullable=True)

    # Photo
    member_photo_path: Mapped[str | None] = mapped_column(String(512), nullable=True)

    # Neighbour directory: when False, other members see this member's name,
    # land and dags but not their mobile number.
    show_in_neighbour_directory: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=true(), nullable=False
    )

    # Governance (foundation): member class + suspension record. These never
    # gate authentication or land-info access.
    member_class: Mapped[str | None] = mapped_column(String(32), nullable=True)
    governance_status: Mapped[str] = mapped_column(
        String(16), default=GOVERNANCE_STATUS_ACTIVE, server_default=GOVERNANCE_STATUS_ACTIVE, nullable=False
    )
    suspension_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    suspension_notice_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("admin_users.id"), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Outcome of the rejection email: "sent" or "failed" (None = not attempted).
    notification_status: Mapped[str | None] = mapped_column(String(16), nullable=True)

    properties: Mapped[list["Property"]] = relationship(
        back_populates="member", cascade="all, delete-orphan"
    )
    nominees: Mapped[list["Nominee"]] = relationship(
        back_populates="member", cascade="all, delete-orphan"
    )
    @property
    def needs_dag(self) -> bool:
        """True when any property still has an unknown, unfilled dag. Reads the
        already-loaded properties only (False when they are not loaded, so a
        summary row never triggers a lazy load); list endpoints set it by query."""
        if "properties" not in self.__dict__:
            return False
        return any(property_needs_dag(p) for p in self.properties)

    credential: Mapped["MemberCredential | None"] = relationship(
        back_populates="member", cascade="all, delete-orphan", uselist=False
    )
    installments: Mapped[list["Installment"]] = relationship(
        back_populates="member", cascade="all, delete-orphan"
    )

    @property
    def properties_count(self) -> int:
        return len(self.properties)


from app.models.property import Property, property_needs_dag  # noqa: E402
from app.models.nominee import Nominee  # noqa: E402
from app.models.credential import MemberCredential  # noqa: E402
from app.models.installment import Installment  # noqa: E402
