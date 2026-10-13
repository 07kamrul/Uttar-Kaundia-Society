from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.common import AddressDetail, Nominee, PropertyIn, validate_phone


class SubmissionPayload(BaseModel):
    """JSON payload sent as the 'payload' form field alongside file uploads
    (memberPhoto, and propertyDoc_<propertyIndex>_<docIndex> files).

    Field names mirror src/lib/types.ts FormData/PropertyItem/Nominee, snake_cased.
    """

    full_name: str
    father_or_husband: str
    mother: str
    dob: str
    # Required unless the matching feature flag is on; enforced in the route
    # (flags live in the database, pydantic validators cannot read them).
    nationality: str | None = None
    occupation: str | None = None
    nid: str
    mobile: str
    gender: str
    email: EmailStr

    permanent_address: AddressDetail | None = None
    current_address: AddressDetail | None = None
    current_address_abroad: bool = False
    current_country: str | None = Field(default=None, max_length=2)
    current_city: str | None = Field(default=None, max_length=100)
    current_address_text: str | None = Field(default=None, max_length=500)
    has_whatsapp: bool | None = None
    consent_version: str | None = Field(default=None, max_length=16)

    urgent_contact_name: str | None = None
    urgent_contact_relation: str | None = None
    urgent_contact_mobile: str | None = None
    urgent_contact_address: str | None = None

    properties: list[PropertyIn] = []
    nominees: list[Nominee] = []

    admission_fee: str
    subscription: str
    receipt_no: str
    payment_method: str

    member_signature: str | None = None
    submission_date: str

    _validate_phones = field_validator("mobile", "urgent_contact_mobile")(validate_phone)
