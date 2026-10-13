# Batch 6 — Login and passwords: shared contract (backend · Angular · Flutter)

Source: [`ux-simplification-audit.md`](ux-simplification-audit.md) §8 and §13 (Login, R8, admin-assisted reset dropped).
**Rule:** with `login_by_phone` and `password_policy_v2` **off**, login, reset and change-password behave exactly as today. Email reset is unchanged. There is no SMS/OTP and no admin-assisted reset.

## Today (verified in code)

- **`POST /api/login {identifier, password}`** (`api/routes/auth.py`):
  - the identifier is lowercased;
  - it tries `AdminUser.email`, then `MemberCredential.username` (= member ID lowercased, e.g. `ukamks-12`);
  - **member email and mobile are not accepted**;
  - 401 `"Invalid credentials"`;
  - `login_failure_limiter` gives 10 failures per 15 min per identifier string.
- `/forgot-password` accepts an admin email, a username or a member's registered email.
- **`validate_new_password`** (`schemas/auth.py`): minimum 8 + a digit.
  - It is used by `/reset-password` **and** `/api/member/change-password`, so the server already enforces it on reset.
  - The Angular `reset-password.component.ts` and Flutter `reset_password_page.dart` have **no client-side policy check**.
  - `change-password.component.ts` (`passwordPolicy`) and Flutter `change_password_bloc.dart` hard-code the digit rule.
- **`must_change_password`** is set only on approval (`admin.py` temp password) and on admin reset. Both are system-generated. Self reset or change clears it. Keep this as is.
- **Mobiles:**
  - stored as E.164 (`normalize_mobile`, default region BD);
  - legacy rows may be digits-only `01…` until fixed (`phone_fix_queue`);
  - partial unique index `ix_members_mobile_active` (non-rejected), **exact string only**, so the same number in two formats can coexist;
  - `Member.email` is likewise unique per non-rejected member.

## Flags

| Key | Status | Covers |
|---|---|---|
| `login_by_phone` | **New** | Mobile **and member email** accepted in `/login`; the new label, helper text and errors |
| `password_policy_v2` | Exists | Minimum 8 characters + common-password blocklist, no digit rule; client checks on change **and reset** pages |

## Backend

### Identifier resolution — new `services/login_identity.py`

`classify(raw) -> "email" | "phone" | "username"`:
- Trim, then convert Bangla digits (`ascii_digits`).
- **email** if it contains `@`.
- **phone** if it matches `^[\d+\-\s().]+$`, has ≥ 10 digits, and `normalize_mobile()` succeeds. No `+` means BD, so `01…`, `+8801…`, `8801…`, `০১৭…` and spaces/dashes are all accepted. Foreign numbers need a `+`.
- **username** otherwise (member IDs contain letters, so they are never phone-like).

The **rate-limit key is canonical**: E.164 for phones and lowercased text otherwise. Typing the same number in different formats therefore shares one bucket. Rate limiting is kept unchanged otherwise.

`/login` flow (with `login_by_phone` off, step 2 and step 3 are skipped and phone-like input falls through to username, i.e. today's behaviour):
1. **Admin email:** as today.
2. **Email:**
   - try `MemberCredential.username == email` (legacy);
   - then members joined with their credential where `lower(email) == email` and status ≠ rejected.
3. **Phone:** members joined with their credential where `mobile IN mobile_lookup_variants(e164)` and status ≠ rejected. This uses `ix_members_mobile_active` on Postgres; no migration is needed.
4. **Username:** as today.

Candidate outcomes:
- **0** → 401 generic, failure recorded.
- **1** → verify the password; on failure, 401 generic and the failure is recorded.
- **≥ 2** → verify the password against each candidate (at most 5).
  - If at least one matches: **409** `{"code":"LOGIN_AMBIGUOUS_IDENTIFIER","kind":"mobile|email"}`, **not** recorded as a failure. The member is asked to use email or member ID (sign-off).
  - Otherwise: 401 generic + failure recorded.
  - Because the ambiguity is only revealed to someone who knows a valid password, the endpoint does not leak which numbers are shared.

The 401 detail stays exactly `"Invalid credentials"`. `/admin/login` and `/member/login` are unchanged.

### Duplicate-mobile pre-check (read-only)

- **CLI:** `python -m scripts.report_duplicate_mobiles` (new `backend/scripts/report_duplicate_mobiles.py`, same style as `resolve_duplicate_members.py` but **never writes**).
  - It prints the groups.
  - It exits with 1 when there are blocking duplicates (a go/no-go check before turning the flag on).
- **`GET /api/admin/login-readiness`** (`manage_system_config`):
  ```json
  {"login_by_phone_enabled":false,"members_with_login":412,
   "duplicate_mobile_groups":[{"mobile":"+8801712345678","members":[{"id":7,"member_id":"UKAMKS-7","full_name":"…","status":"approved","has_login":true}]}],
   "duplicate_group_count":1,
   "unparseable_mobiles":[{"id":9,"member_id":"UKAMKS-9","raw":"01-7"}],
   "open_phone_fixes":3,
   "duplicate_email_groups":[]}
  ```
  - Grouping normalises every non-rejected member's mobile in Python (`normalize_mobile`), so `017…` and `+88017…` collide.
  - Only groups where ≥ 2 members have a login can block login. The others are listed for information.
- The shared logic lives in `login_identity.duplicate_groups(db)`.

### Password policy v2 — new `core/password_policy.py`

- `COMMON_PASSWORDS: frozenset[str]`, about 100 entries, lowercased. For example: `12345678`, `123456789`, `11111111`, `00000000`, `87654321`, `password`, `password1`, `password123`, `qwertyui`, `qwerty123`, `abcd1234`, `abc12345`, `iloveyou`, `admin123`, `bangladesh`, `bangladesh1`, `dhaka123`, `kaundia`, `kaundia123`, `ukamks123`, `01234567`.
- The check is case-insensitive after `ascii_digits` + trim.
- `validate_new_password(current, new, *, policy_v2: bool = False)`. With v2:
  - `len(new) < 8` → `PASSWORD_TOO_SHORT`;
  - in the blocklist → `PASSWORD_TOO_COMMON`;
  - equal to the current password → `PASSWORD_SAME_AS_CURRENT`.
  - v1 is unchanged.
- Callers read `await is_enabled(db, "password_policy_v2")`: `auth.reset_password` and `member.change_password`.
- 422 details stay as they are, plus a `code` field: `{"message":…, "errors":{…}, "code":"PASSWORD_TOO_COMMON"}`. On reset today it is `{"errors":…}`, which gains `code`.
- The blocklist is **server-only**. Clients check length only and map the code.

## Angular

- **`features/auth/pages/login/`** with `login_by_phone` on:
  - label **"মোবাইল / ইমেইল / সদস্য আইডি"**;
  - helper **"বিদেশি নম্বর হলে + ও দেশের কোড সহ লিখুন"**;
  - `autocomplete="username"`, `inputmode="text"` (email must still be typeable);
  - errors by status:
    - 401 → "মোবাইল/ইমেইল/সদস্য আইডি অথবা পাসওয়ার্ড সঠিক নয়";
    - 409 `LOGIN_AMBIGUOUS_IDENTIFIER` → "এই নম্বরে একাধিক অ্যাকাউন্ট আছে — ইমেইল বা সদস্য আইডি দিয়ে লগইন করুন";
    - 429 → "অনেকবার চেষ্টা হয়েছে, ১৫ মিনিট পরে আবার চেষ্টা করুন".
  - Today every failure shows one message.
- **`core/errors/user-error.ts`:** add `LOGIN_AMBIGUOUS_IDENTIFIER`, `PASSWORD_TOO_SHORT`, `PASSWORD_TOO_COMMON`, `PASSWORD_SAME_AS_CURRENT`.
- **`features/member/pages/change-password/`:** `passwordPolicy` becomes flag-aware (v2 = length only), with v2 hint text.
- **`features/auth/pages/reset-password/`:** add the same validator, the hint and the server-code mapping.
- **Advanced › "লগইন প্রস্তুতি"** (route `/advanced/login-readiness`, `manage_system_config`): a read-only view of the report; phone-fix rows link to `/phone-fixes` (Batch 5).
- The forgot-password page is unchanged.

## Flutter

- `features/auth/pages/login_page.dart`: the same label, helper and error mapping by status/code.
- `core/network/api_error_messages.dart`: the new codes.
- `features/member/presentation/bloc/change_password_bloc.dart` and `features/auth/pages/reset_password_page.dart`: v2 length-only check via `FeatureFlag.passwordPolicyV2`.
- `l10n` keys.
- New `FeatureFlag.loginByPhone`.

## Copy (BN)

মোবাইল / ইমেইল / সদস্য আইডি · বিদেশি নম্বর হলে + ও দেশের কোড সহ লিখুন · পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে · এই পাসওয়ার্ডটি খুব সাধারণ, অন্য একটি দিন · নতুন পাসওয়ার্ড আগেরটির মতো হতে পারবে না

## Tests

**Backend:**
- `test_login_identity.py`:
  - classification;
  - every BD format plus Bangla digits logs in;
  - legacy `017…` row found via variants;
  - foreign `+44…` works, and foreign without `+` → 401;
  - flag off → 401 for a phone (as today);
  - member email login;
  - admin email unchanged;
  - rejected member's mobile ignored;
  - ambiguous → 409 only with a correct password, 401 with a wrong one;
  - limiter shared across formats; 429 after 10;
  - 401 body unchanged.
- `test_password_policy.py`:
  - v1 unchanged;
  - v2 accepts `abcdefgh` and rejects `12345678`, `Password`, `১২৩৪৫৬৭৮`, length 7;
  - `code` present on reset and change;
  - `must_change_password` cleared by self change/reset and set by approval/admin reset.
- `test_login_readiness.py`: cross-format grouping, unparseable rows, 403 without permission, CLI exit codes.
- Existing `test_auth_rate_limit.py`, `test_change_password.py` and `test_password_reset.py` stay green.

**Angular:** login label/helper with the flag on/off; 401/409/429 messages; change and reset validators v1/v2; server-code mapping; readiness page.

**Flutter:** the same for the login page, change-password bloc and reset page.

## Risks

- **Enumeration:** handled by revealing ambiguity only after a correct password. Response time differs between 0 and n candidates (as today for unknown usernames); an optional dummy hash verify can equalise it.
- **Unconverted legacy mobiles** (`phone_fix_queue`) cannot log in by phone until fixed. They can still use the member ID. The readiness report lists them.
- **In-process limiter:** per instance, as today.
- **Turning the flag on with duplicates present is safe** (409 path), but those members get a worse first experience. Run the CLI first.

## Open decisions (owner)

- **B6-O1:** If the password matches exactly one account in an ambiguous group, log that account in, or keep asking for email/ID? The sign-off reads as "ask", which is what is proposed here.
- **B6-O2:** Should member-email login sit under `login_by_phone` (proposed) or get its own flag?
- **B6-O3:** Should v2 also reject a password equal to one's own mobile or member ID? (Not in the sign-off; proposed: no, keep the policy minimal.)

**Adopted for implementation (owner may override):** every open decision above takes its *proposed* option.
