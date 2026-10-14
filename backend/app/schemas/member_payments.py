from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.installment_payment import PaymentAccountOut
from app.schemas.other_fees import OtherFeeTypeOut
from app.services.other_fee_verification import parse_id_ref


class DueItemOut(BaseModel):
    kind: str
    ref_id: int
    title: str
    amount: Decimal
    due_date: date | None = None
    pending: bool = False


class PaymentSummaryOut(BaseModel):
    currency: str = "BDT"
    total_due: Decimal
    total_paid: Decimal
    pending_count: int
    pending_amount: Decimal
    dues: list[DueItemOut]
    payable_fee_types: list[OtherFeeTypeOut]
    accounts: list[PaymentAccountOut]


class PaymentHistoryItemOut(BaseModel):
    kind: str
    id: int
    title: str
    amount: Decimal
    method: str | None = None
    reference: str | None = None
    date: date
    status: str
    rejection_reason: str | None = None
    proof_url: str | None = None


class PaymentHistoryPageOut(BaseModel):
    items: list[PaymentHistoryItemOut]
    total: int
    page: int
    page_size: int


class CostSharePaymentAdminOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    member_id: int
    member_name: str | None = None
    member_display_id: str | None = None
    share_id: int
    cost_title: str | None = None
    amount_due: Decimal
    amount_paid: Decimal
    remaining: Decimal
    method: str
    transaction_ref: str
    sender_account: str | None = None
    amount: Decimal
    paid_on: date
    proof_url: str | None = None
    note: str | None = None
    status: str
    rejection_reason: str | None = None
    reviewed_at: datetime | None = None
    created_at: datetime


class PendingVerificationsOut(BaseModel):
    installment: int
    cost_share: int
    other_fee: int = 0
    total: int


BULK_MAX_ITEMS = 50


class BulkItemIn(BaseModel):
    """installment / cost_share items use `id`. Other-fee items use
    `kind: "other_fee"` with `id_ref: "fee:<id>"` or `"picnic:<id>"` (the two
    tables share id numbers); `id` is then optional and ignored."""

    kind: Literal["installment", "cost_share", "other_fee"]
    id: int | None = Field(default=None, gt=0)
    id_ref: str | None = None

    @model_validator(mode="after")
    def _addressing(self) -> "BulkItemIn":
        if self.kind == "other_fee":
            if self.id_ref is None:
                raise ValueError("id_ref is required for other_fee items")
            parse_id_ref(self.id_ref)
        elif self.id is None:
            raise ValueError("id is required")
        return self

    @property
    def key(self) -> tuple[str, int | str]:
        if self.kind == "other_fee":
            return (self.kind, self.id_ref)
        return (self.kind, self.id)


class BulkApproveIn(BaseModel):
    items: list[BulkItemIn] = Field(min_length=1, max_length=BULK_MAX_ITEMS)
    # What the admin saw and confirmed; any difference from the server is a 409.
    expected_count: int = Field(ge=1)
    expected_total: Decimal = Field(ge=0, max_digits=14, decimal_places=2)

    @model_validator(mode="after")
    def _items_are_unique(self) -> "BulkApproveIn":
        if len({item.key for item in self.items}) != len(self.items):
            raise ValueError("items must be unique")
        return self


class BulkApprovedOut(BaseModel):
    kind: str
    id: int
    id_ref: str | None = None  # other_fee items: "fee:<id>" / "picnic:<id>"
    amount: Decimal


class BulkFailedOut(BaseModel):
    kind: str
    id: int
    id_ref: str | None = None
    code: str  # NO_LONGER_DUE | ALREADY_REVIEWED | AMOUNT_EXCEEDS_REMAINING | NOT_FOUND


class BulkApproveOut(BaseModel):
    batch_id: str
    approved_count: int
    approved_total: Decimal
    approved: list[BulkApprovedOut]
    failed: list[BulkFailedOut]
