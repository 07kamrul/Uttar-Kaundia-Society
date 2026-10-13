# Batch 1 — Registration: shared contract (backend · Angular · Flutter)

Source of decisions: [`ux-simplification-audit.md`](ux-simplification-audit.md) §3, §7 and §13.
**Rule:** with every new flag **off**, today's behaviour is unchanged. Bug fixes marked *always* ship unflagged.

## Feature flags

Existing keys: `reg_occupation_optional` (R2), `reg_hide_nationality` (R3), `reg_road_optional` (R4), `reg_dag_unknown` (R5), `reg_add_property_button` (R6), `reg_min_one_proof` (R7).
New keys, added to all three registries, default off:

| Key | Covers |
|---|---|
| `reg_abroad_address` | "বিদেশে থাকি" toggle for the current address |
| `reg_simplified_ui` | Step header "ধাপ ২ / ৬", one column on phones, DOB দিন/মাস/বছর, address defaults ঢাকা → সাভার, WhatsApp toggle, payment method cards + copy + method-specific reference label + abroad note, review "পরিবর্তন করুন" links, success screen, draft-saved line, image compression on upload, optional signature |

## Submission payload (`SubmissionPayload`, multipart field `payload`, snake_case)

Upload fields are the **existing** ones: `member_photo` (the alias `memberPhoto` is also accepted) and `doc_files`, which are mapped to properties through each property's `applicable_docs`, exactly as today.

New optional fields. All are additive, and older clients keep working.

| Field | Type | Rule |
|---|---|---|
| `has_whatsapp` | bool \| null | Stored as is |
| `current_address_abroad` | bool, default false | If true **and** the flag is on: `current_country` (ISO-3166 alpha-2, not `BD`), `current_city` and `current_address_text` are required, and `current_address` (BD parts) may be null. `permanent_address` stays required as today (Bangladesh). |
| `current_country` | str \| null (2 chars) | |
| `current_city` | str \| null (≤ 100) | |
| `current_address_text` | str \| null (≤ 500) | |
| `consent_version` | str \| null | Stored. If missing, the server stores the current version. |
| `properties[].dag_unknown` | bool, default false | If true **and** `reg_dag_unknown` is on: `dag_no_cs` / `dag_no_rs` may be empty |

Changed rules:
- `occupation`: may be missing or null when `reg_occupation_optional` is on (stored as `""`). With the flag off the field must be present, as today; blank was always accepted.
- `nationality`: when `reg_hide_nationality` is on and it is missing or blank, the server stores `বাংলাদেশী`.
- `road` in addresses: the server never enforced it, so the flag affects client validation only.
- **Email** *(always)*: required, as today. The Angular/Flutter form builders and step validators must both enforce it.
- **Photo** *(always)*: the `member_photo` file is required. Without it the server returns 422 `PHOTO_REQUIRED`.
- **Proof** *(`reg_min_one_proof` on)*: each property needs at least one uploaded file in `doc_files`, otherwise 422 `PROPERTY_PROOF_REQUIRED`. The per-ticked-document rule is replaced.
- `payment_method`: accepts the canonical keys `cash`, `bkash`, `nagad`, `rocket`, `bank`, `other`, plus every legacy value already accepted.
- The reference stays in `receipt_no`. Clients label it "ট্রানজেকশন আইডি (TrxID)" for bkash/nagad/rocket and "রসিদ নম্বর" for cash, bank and other.

## Config read

`GET /api/public/registration-config` (no auth, cached in `public_lists`):

```json
{
  "consent_version": "2026-10",
  "payment_accounts": [{"method": "bkash", "label": "<details text>", "number": "<first digit run or null>", "account_name": null}]
}
```

`payment_accounts` comes from the same source the member pay-dues dialog already uses; reuse it and don't duplicate it. The society's numbers stay in Bangladesh formats.

## Admin (R5 + photo)

- Submission list and detail responses include `properties[].dag_unknown` and `needs_dag: bool` (true when any property has `dag_unknown` and an empty dag). The UI shows the badge **"দাগ দরকার"**.
- `PATCH /api/admin/submissions/{id}/properties/{property_id}/dag` with body `{"dag_no_cs": str|null, "dag_no_rs": str|null}` requires `membership.review`. It needs at least one non-empty value, sets `dag_unknown=false`, and is audited as `property.dag_fill`.
- Other 422 codes: `ABROAD_ADDRESS_REQUIRED` (abroad ticked, but country/city/text is blank, or the country is `BD`), `DAG_REQUIRED_FIELD` (`reg_dag_unknown` on, dag empty and not marked unknown; also from the PATCH when both values are blank).
- Approving a submission while `needs_dag` is true returns 409 `DAG_REQUIRED`. This applies to every approve path (submissions and membership review).
- `PUT /api/admin/submissions/{id}/photo` takes a multipart `memberPhoto` file, requires `membership.review`, and is audited as `member.photo_upload`. Admins use it to upload a photo on the member's behalf.

## Copy (BN; EN equivalents in the language files)

- Abroad note under payment: "বিদেশে থাকলে বাংলাদেশে থাকা কোনো আত্মীয় আপনার হয়ে টাকা দিতে পারেন। ট্রানজেকশন আইডি বা রসিদ নম্বর আর স্ক্রিনশট দিন।"
- Draft: "আপনার তথ্য সংরক্ষিত আছে, পরে আবার এসে শেষ করতে পারেন।"
- Dag help: "আমার দাগ কোথায় পাব?". Checkbox: "আমি দাগ জানি না — অফিস সাহায্য করবে".
- Success: three plain lines ("আবেদন জমা হয়েছে" · "অফিস আপনার তথ্য যাচাই করবে" · "আনুমানিক ২০ কর্মদিবসের মধ্যে জানানো হবে"), plus the reference ID with a copy button.
