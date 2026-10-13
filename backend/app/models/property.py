from sqlalchemy import Boolean, ForeignKey, Integer, JSON, String, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Property(Base):
    __tablename__ = "properties"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True
    )

    property_type: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    property_type_other: Mapped[str | None] = mapped_column(String(255), nullable=True)
    khatian_no: Mapped[str | None] = mapped_column(String(128), nullable=True)
    dag_no_cs: Mapped[str | None] = mapped_column(String(128), nullable=True)
    dag_no_rs: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # True when the applicant does not know the dag; an admin fills it in
    # before approval (see needs_dag on the member).
    dag_unknown: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=false(), nullable=False
    )
    holding_number: Mapped[str | None] = mapped_column(String(128), nullable=True)
    land_quantity: Mapped[str | None] = mapped_column(String(128), nullable=True)
    my_share_quantity: Mapped[str | None] = mapped_column(String(128), nullable=True)
    ownership: Mapped[str | None] = mapped_column(String(32), nullable=True)
    joint_owner_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    member: Mapped["Member"] = relationship(back_populates="properties")
    co_owners: Mapped[list["CoOwner"]] = relationship(
        back_populates="property", cascade="all, delete-orphan"
    )
    applicable_docs: Mapped[list["ApplicableDoc"]] = relationship(
        back_populates="property", cascade="all, delete-orphan"
    )


def property_needs_dag(prop: "Property") -> bool:
    """Dag was declared unknown and no admin has filled either dag yet."""
    return bool(prop.dag_unknown) and not (
        (prop.dag_no_cs or "").strip() or (prop.dag_no_rs or "").strip()
    )


class CoOwner(Base):
    __tablename__ = "co_owners"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    property_id: Mapped[int] = mapped_column(
        ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True
    )
    owner_name: Mapped[str] = mapped_column(String(255), nullable=False)
    owner_phone: Mapped[str] = mapped_column(String(32), nullable=False)
    owner_phone_raw: Mapped[str | None] = mapped_column(String(64), nullable=True)

    property: Mapped["Property"] = relationship(back_populates="co_owners")


class ApplicableDoc(Base):
    __tablename__ = "applicable_docs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    property_id: Mapped[int] = mapped_column(
        ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True
    )
    doc_type: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str | None] = mapped_column(String(512), nullable=True)

    property: Mapped["Property"] = relationship(back_populates="applicable_docs")


from app.models.member import Member  # noqa: E402
