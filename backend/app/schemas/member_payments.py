from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.schemas.installment_payment import PaymentAccountOut
from app.schemas.other_fees import OtherFeeTypeOut


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
    total: int
