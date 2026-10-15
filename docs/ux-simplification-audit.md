# UX Simplification Audit — Bangladesh-first (Step 0)

**Status:** Draft for sign-off · **Date:** 2026-10-13 · **Scope:** Angular `frontend/`, FastAPI `backend/`, Flutter `mobile/`
**Builds on:** [`USABILITY_AUDIT.md`](USABILITY_AUDIT.md) (screen-level, 2026-10-13). This document goes to **field level** and adds sign-off markers, constraints and metrics.
**Nothing has been changed in code.** Implementation starts only after sign-off.

## Legend

| Column | Meaning |
|---|---|
| **Who** | V = visitor, M = member, A = admin (Executive Committee / Administrator), SA = super admin |
| **Diff.** | Difficulty for an average member: 1 easy · 2 medium · 3 hard |
| **Decision** | KEEP · SIMPLIFY · MERGE · HIDE (behind "Advanced" or a feature flag) · REMOVE |
| ⚖ | Protected: required by the constitution, approval/audit trail, security or fee/ownership data. Never removed. |
| 🔏 | **Needs your sign-off.** It deletes or drops a field or feature, or changes a server-side requirement. |

Removal policy: every 🔏 item is first **hidden behind a feature flag**. The code and data are deleted one release later, after a second confirmation.

---

## 1. Facts from the code that shape the decisions

1. **There is no feature-flag mechanism** in the backend, Angular or Flutter. **Prerequisite:** a small `feature_flags` table and settings endpoint, with an Angular and a Flutter flag service.
2. **The backend `SubmissionPayload` requires** nationality, occupation, email, NID, receipt_no and the payment fields (`backend/app/schemas/submission.py`). Making these optional means changing the server schema, which needs sign-off (🔏).
3. **The frontend has two validation layers that disagree.** The form builder requires email, NID and photo; the step validators do not. As a result the email label shows `*` but the field is not enforced.
4. **No WhatsApp field, no consent version, and no transaction ID** separate from `receipt_no`.
5. **No signature pad exists.** Step 5 is titled "Declaration & Signature", but `memberSignature` is never set.
6. **BN mode shows English dates and Latin digits.** `LOCALE_ID` and `registerLocaleData` are never set; the 30 `| date` uses render in English; `৳` is concatenated by hand.
7. **No image compression and no offline banner.** The limits are photo 3 MB and documents 5 MB.
8. **Login does not accept a mobile number.** The field is username / email / member ID. Reset works **by email only**, with no SMS/OTP.
9. **Members see up to 21 sidebar items.** Admins see 16 flat Management items plus 9 Administration items.
10. **`CACHE_INTEGRATION.md` does not exist** in the repo, although the brief refers to it. The cache admin API exists (`backend/app/api/routes/cache_admin.py`) but has no UI.
11. **Security gap carried over from `USABILITY_AUDIT.md`:** `/installments-management` and `/fees-management` are guarded only by `member.view_all`. This is fixed in the admin batch whatever is decided here.

---

## 2. Language and wording (all member-facing)

| Item | Who | Diff. | Decision | Reason (BD context) |
|---|---|---|---|---|
| Default language | V/M | 1 | KEEP BN default; verify Flutter `languageCode` default = `bn` | Bangla-first users |
| Language control (inside the user menu, "EN / অ-A") | all | 2 | SIMPLIFY → one visible **"বাংলা \| English"** in the header and on the public pages | Hard to find for low-tech users |
| Theme toggle (user menu) | all | 1 | MOVE → Profile › Settings | Rarely used |
| English menu labels in BN (`Installments`, `Other Fees`, `Cost Shares`, `Resolution Book`, `Fund Transparency`, `Roadmap`, `Audit log`, `Config lists`, `Permissions`) | M/A | 2 | SIMPLIFY → পেমেন্ট, আমার বকেয়া, আয়-ব্যয়ের হিসাব, আমাদের পরিকল্পনা, সভার সিদ্ধান্ত, কার্যক্রমের ইতিহাস, তালিকা সেটিংস, অনুমতি | Plain everyday Bangla |
| 46 BN strings with Latin words (`NID নং`, `মোবাইল (WhatsApp)`, `রসিদ নং/Transaction ID`, `MFS নম্বর`, `CSV এক্সপোর্ট`, raw keys `boundary.manage` and `fund.approve_secondary`, `যেমন: mobile`, …) | M/A | 2 | SIMPLIFY → জাতীয় পরিচয়পত্র (এনআইডি), ট্রানজেকশন আইডি (TrxID), বিকাশ/নগদ/রকেট নম্বর; **remove raw permission and field keys** from text. File types (JPG/PDF) and brand names stay in Latin script. | No jargon or internal keys |
| Footer "নির্মাণে: Anshin Tech" | V | 1 | KEEP | Proper name |
| Dates in BN (`Oct 11, 2026`) | all | 2 | SIMPLIFY → register the `bn` locale, use a shared `bnDate` pipe → `১১ অক্টোবর ২০২৬` / `১১/১০/২০২৬` | Readability |
| Digits and money | all | 2 | SIMPLIFY → shared `bnNumber` / `taka` pipes (BN digits + `৳`). Replaces the 61 hand-written `৳ ` uses and `digits.helper.ts`. | Consistency |
| Status chips (colour + text only) | M/A | 2 | SIMPLIFY → colour **+ icon + plain word**: ⏳ অপেক্ষায় · ✔ অনুমোদিত · ✖ বাতিল · ৳ বকেয়া · ✔ পরিশোধিত | Colour-blind users, low literacy |
| Raw `err.error.detail` shown in about 30 places; one generic login error | M | 3 | SIMPLIFY → a mapped error catalogue: *what went wrong + what to do*, e.g. "মোবাইল নম্বর ১১ সংখ্যার হতে হবে, যেমন ০১৭XXXXXXXX" | Members can't act on server text |

---

## 3. Registration form (`features/public-registration/`, Flutter `registration/`)

Current steps: 1 member + address · 2 property · 3 contacts + nominee · 4 payment · 5 declaration · 6 review. **Keep 6 steps** and show "ধাপ ২ / ৬ — সম্পত্তি". One column on phones.

### 3.1 Step 1 — Member

| Field | Today | Diff. | Decision | Reason / constraint |
|---|---|---|---|---|
| Photo (3 MB, builder-required, not enforced) | file | 2 | SIMPLIFY: camera/gallery, **auto-compress ≤ 1 MB**, preview | Cheap phones produce 4–8 MB photos |
| Full name, father/husband, mother | text, req. | 1 | KEEP ⚖ | Identity for membership |
| Date of birth | date-picker | 2 | SIMPLIFY: দিন/মাস/বছর dropdowns, Bangla digits accepted | Date-pickers are hard for older users |
| NID | `type=text`, pattern 10–17 | 2 | SIMPLIFY ⚖: `inputmode="numeric"`, Bangla digits, **exactly 10, 13 or 17**, friendly message. Make it **required in both layers** (fixes the mismatch). | Identity proof is required for membership |
| Mobile | phone input, any country | 1 | SIMPLIFY ⚖: `inputmode="tel"`, BD default `01XXXXXXXXX` / `+8801…`, Bangla digits normalised | |
| WhatsApp (in the mobile label only) | — | 1 | SIMPLIFY: toggle **"এই নম্বরে হোয়াটসঅ্যাপ আছে"**. Needs a new nullable `has_whatsapp` column (additive). | No separate number |
| Email | `*`, server-required | 3 | SIMPLIFY → **optional** 🔏 (server schema change; reset then needs a non-email path, see §8) | Many members have no email |
| Occupation | UI optional, **server-required** | 1 | SIMPLIFY → optional on the server 🔏 | Align with the UI |
| Nationality | free text, default বাংলাদেশী, server-required | 1 | HIDE → default `বাংলাদেশী`; shown only when **"অন্য দেশের নাগরিক"** is ticked. The column is kept. | Almost every member is Bangladeshi |
| Gender | radio | 1 | KEEP | |
| Submission date | auto today | 1 | KEEP (read-only) | |

### 3.2 Step 1 — Address (12 required fields today)

| Field | Decision | Reason |
|---|---|---|
| Division / district / upazila | SIMPLIFY: **pre-select ঢাকা → সাভার**, searchable dropdowns | Most members are local |
| Post office | SIMPLIFY: dropdown filtered by upazila, with free text as fallback | |
| House, road | KEEP; road optional 🔏 | Unnamed roads are common |
| "Same as current" checkbox | SIMPLIFY: **ticked by default** when the property is in Uttar Kaundia | Fewer inputs |

### 3.3 Step 2 — Property ⚖ (fee calculation + ownership)

| Field | Today | Decision | Reason |
|---|---|---|---|
| Property count −/+ stepper "N / 9" | stepper | MERGE → **"+ আরেকটি সম্পত্তি যোগ করুন"**; count derived from the list; max 9 kept on the server | Simpler mental model |
| Property type checkboxes | checkboxes | KEEP; "other" text only when অন্যান্য is ticked | |
| Khatian no. | text, req. | KEEP ⚖ + example "যেমন: ২২১৪", numeric keyboard, **"আমার দাগ কোথায় পাব?"** help sheet with a sample porcha image | Members don't know where to look |
| CS / RS dag | both req. | SIMPLIFY ⚖: examples + help sheet + checkbox **"আমি দাগ জানি না — অফিস সাহায্য করবে"** that flags `needs_office_help`; an admin completes the dag **before approval** 🔏 | Don't block registration |
| Holding no. | optional | KEEP | |
| Land quantity / my share | decimal, req. | KEEP ⚖, Bangla digits, unit hint (শতাংশ) | Fee calculation |
| Single/joint + `jointOwnerCount` | radio + number | SIMPLIFY ⚖ wording: "এই সম্পত্তিতে আপনার সাথে আর কত জন মালিক?" with a −/+ stepper | Plain words |
| Documents: one file required per ticked document type | checkbox + file each | SIMPLIFY ⚖ → **at least one proof** (খতিয়ান / নামজারি / খাজনার রসিদ / উত্তরাধিকার সনদ), camera or gallery, **auto-compress**, PDF allowed | Proof is still required |

### 3.4 Step 3 — Contacts & nominee

| Field | Decision |
|---|---|
| Urgent contact (name + mobile req.) | KEEP; relation as a dropdown |
| Nominee: one required, more optional | KEEP ⚖; "same as urgent contact" checkbox already exists |

### 3.5 Step 4 — Payment

| Field | Today | Decision |
|---|---|---|
| Admission fee / subscription | `type=number`, server-filled | SIMPLIFY → **read-only**, BN digits + ৳ ⚖ |
| Payment method | checkbox-as-radio, untranslated constants | SIMPLIFY → large radio cards: **নগদ টাকা · বিকাশ · নগদ (MFS) · রকেট · ব্যাংক · অন্যান্য** |
| Society account details | hard-coded `ORG_BANK_INFO` / `ORG_MFS_INFO` | SIMPLIFY → load from settings (the server accounts the pay-dues dialog already uses) + a **"কপি"** button |
| Reference field "রসিদ নং/Transaction ID" | mixed language | SIMPLIFY → the label **changes by method**: "ট্রানজেকশন আইডি (TrxID)" for MFS, "রসিদ নম্বর" for cash or bank. Stored in the existing `receipt_no` (no API break). |
| Proof upload (optional) | file 5 MB | SIMPLIFY → "পেমেন্টের স্ক্রিনশট দিন", compressed |
| Online gateway | — | **Not built** (needs your approval) |

### 3.6 Steps 5–6, draft, success

| Item | Decision |
|---|---|
| Consent checkbox | KEEP ⚖, wording "আমি গঠনতন্ত্র ও শর্তে সম্মত"; **add a `consent_version` column** (additive) |
| Signature | Today: none (dead field). ADD an **optional** drawn or photo signature, never mandatory |
| Draft autosave (localStorage incl. files, fails silently at ~5 MB) | SIMPLIFY: files in IndexedDB; visible line "আপনার তথ্য সংরক্ষিত আছে, পরে আবার এসে শেষ করতে পারেন" |
| Review: four cards with Edit | SIMPLIFY → every section in plain text, a "পরিবর্তন করুন" link per section |
| Success modal | SIMPLIFY → a full screen: reference ID with a copy button, **three lines for what happens next**, and the expected wait |

---

## 4. Member navigation → 5 areas (Angular bottom bar on phones; Flutter already has `NavigationBar`)

| Current item | Who | Diff. | Decision → new home |
|---|---|---|---|
| Dashboard | M | 2 | SIMPLIFY → **হোম "আমার অবস্থা"**: status card with the next step, dues + "পেমেন্ট করুন", latest notice, next event, big icon buttons, no tables |
| Installments | M | 2 | MERGE → **পেমেন্ট** |
| Other Fees | M | 3 | MERGE → **পেমেন্ট** |
| Cost Shares (read-only today) | M | 2 | MERGE → **পেমেন্ট**; payable through the same verification flow |
| Profile, ID card | M | 1 | KEEP → **প্রোফাইল** |
| Change password, theme, logout | M | 1 | MOVE → **প্রোফাইল** |
| Neighbours | M | 1 | MOVE → **আমার জমি** |
| Plot map | M | 3 | MOVE → **আমার জমি** + wizard (§5) |
| Property requests | M | 2 | MOVE → **আমার জমি** (my properties + document checklist) |
| Notices, Events | V/M | 1 | MOVE → **সংগঠন** |
| Resolution Book | M | 2 | MOVE → সংগঠন, renamed "সভার সিদ্ধান্ত" |
| Fund Transparency | M | 3 | MOVE → সংগঠন, "আয়-ব্যয়ের হিসাব"; advanced charts under "আরও দেখুন" |
| Roadmap | M | 2 | MOVE → সংগঠন, "আমাদের পরিকল্পনা" |
| Membership (class, waiver/appeal) | M | 2 | KEEP ⚖ → প্রোফাইল › "আমার সদস্যপদ" |
| Complaints + land-protection complaint | M | 2 | MERGE → সংগঠন › **"অভিযোগ / সাহায্য"** ⚖ |
| Service standard | M | 2 | MERGE into অভিযোগ/সাহায্য as an info section ⚖ |
| Elections | M | 2 | KEEP ⚖ → সংগঠন; highlighted only during an active election |
| Petitions, Amendments | M | 3 | HIDE under সংগঠন › "আরও" ⚖ (rights kept; rarely used) |
| Welfare fund | M | 2 | KEEP ⚖ → সংগঠন |
| Emergency help | M | 1 | MERGE → floating **"সাহায্য দরকার?"** button (call / WhatsApp helpline + help-desk page) |
| Language toggle | M | 1 | MOVE → header, "বাংলা \| English" |

**Result:** 21 items become 5 tabs plus a help button.

**পেমেন্ট page:** top cards **"আমার বকেয়া ৳…"** and **"পরিশোধ করেছি ৳…"**, then one **"পেমেন্ট করুন"** flow: what are you paying for → method + TrxID + screenshot → confirm. Below that, one combined history with filters. The existing endpoints are reused, with no API break.

---

## 5. Plot boundary map → guided wizard

| Item | Today | Decision |
|---|---|---|
| View modes (boundaries / BDS / RAJUK RS), street/satellite | always visible | HIDE under **"আরও লেয়ার"**; default "আমার জমি" |
| Legend (5 colours) | floating | SIMPLIFY → 3 colours + words (অনুমোদিত / আমার / অপেক্ষায়) |
| Drawing flow | free | SIMPLIFY → **১. দাগ খুঁজুন → ২. সীমানা ঠিক করুন** (default "দাগ থেকে শুরু করুন" = snap-to-RS) **→ ৩. জমা দিন** |
| Undo / redo | none (cancel only) | ADD, with text labels |
| First-time tour | none | ADD |
| Approximate-boundary notice | long | SIMPLIFY → one sentence |
| Required to register | no | KEEP optional |
| Data-saver | — | Don't load tiles until "মানচিত্র দেখুন" is tapped |

---

## 6. Admin / management → "আজকের কাজ" console

### 6.1 Landing and queues

| Item | Who | Decision |
|---|---|---|
| Admin dashboard (pending submissions only + cost/finance cards) | A | SIMPLIFY → **আজকের কাজ**: count cards for pending applications, payments to verify, complaints due/overdue, property requests, boundaries, expiring committee terms; one tap opens the queue |
| Submissions + Membership Review (two intake queues) | A | MERGE → one **"আবেদন"** queue with tabs ⚖ (both approval trails kept) |
| All queues: status filter only | A | ADD search by **name / mobile / member ID** + filters |
| Payment Verifications: one row at a time, free-text reason | A | ADD **bulk approve** (confirm with count + total ৳; one audit entry per payment ⚖) and **canned Bangla reasons**, editable: "TrxID মিলছে না", "টাকার পরিমাণ মিলছে না", "স্ক্রিনশট অস্পষ্ট", "ডুপ্লিকেট পেমেন্ট" |
| Reject reasons elsewhere | A | Canned reasons + edit; the reason stays mandatory ⚖ |
| `/installments-management`, `/fees-management` guarded by `member.view_all` | A | **Security fix:** require a finance permission |

### 6.2 Menu regrouping (16 + 9 flat items → 4 groups + Advanced)

| Group | Items |
|---|---|
| **আবেদন ও সদস্য** | আবেদন (merged), সদস্য তালিকা, সম্পত্তির অনুরোধ, সদস্যপদ (waiver/suspension/appeal ⚖) |
| **টাকা-পয়সা** | পেমেন্ট যাচাই, কিস্তি, অন্যান্য ফি, আয়-ব্যয়, সমিতির খরচ, তহবিল নিয়ন্ত্রণ ⚖ |
| **সংগঠন** | নোটিশ ও অনুষ্ঠান (**MERGE** the two pages, same permission), সভার সিদ্ধান্ত, অভিযোগ ⚖, কমিটি ⚖, নির্বাচন ⚖, কল্যাণ কার্যক্রম, সম্পদ রেজিস্টার ⚖, সীমানা যাচাই |
| **সেটিংস** | ফি সেটিংস (wizard), পরিকল্পনা |
| **সেটিংস › Advanced** (one-line explanations) | Roles & Permissions ⚖, per-user overrides, Config Lists, Audit Log ⚖, Amendment versions ⚖, cache stats (optional read-only view) |

Hidden items are moved, never deleted. Internal IDs, JSON and permission keys are removed from visible text.

### 6.3 Fee settings ⚖
Today it is one 636-line page: a versioned form, history, a calculator and a create-type form. **SIMPLIFY → wizard:** "নতুন রেট চালু করুন → কবে থেকে কার্যকর → নিশ্চিত করুন (পুরোনো ৳X → নতুন ৳Y)". History, calculator and create-type go under Advanced. The versioning model is unchanged.

---

## 7. Proposed removals / relaxations — **each needs your sign-off** 🔏

| # | Item | Proposal | Data impact |
|---|---|---|---|
| R1 | Email required (server) | Optional | Relaxation only |
| R2 | Occupation required (server) | Optional | Relaxation only |
| R3 | Nationality visible | Hide behind "অন্য দেশের নাগরিক" | None (column kept, default বাংলাদেশী) |
| R4 | Road required | Optional | None |
| R5 | CS/RS dag required at submit | "আমি দাগ জানি না" + admin completes | New nullable flag; dag still required **before approval** ⚖ |
| R6 | Property count control | Replace with "+ add" | None |
| R7 | One file per ticked document | At least one proof | None |
| R8 | Password must contain a digit | Min 8 chars only | None |
| R9 | Separate entries: Emergency help, Service standard, Land complaint, Notices-mgmt vs Events-mgmt | Merge entry points (pages kept) | None |
| R10 | Roadmap Mgmt, Config Lists, Asset Register, Amendments in the main menus | Hide under Advanced / "আরও" | None |

**Never removed** ⚖: consents, member class, NID / identity proof, nominees, land quantity / share / dag / khatian / ownership, approval queues and reasons, audit log, roles/permissions, fee versioning, elections, committee registry, complaint SLA, fund controls.

---

## 8. Login and accounts

| Item | Today | Decision |
|---|---|---|
| Identifier | username / email / member ID | ADD **mobile number** (normalised lookup); label "মোবাইল নম্বর বা সদস্য আইডি" |
| Show/hide password | exists | KEEP |
| Policy | min 8 + one digit | Min 8 only (R8) |
| Reset page skips the policy check | | FIX |
| Forgot password | email link only | ADD **admin-assisted reset** (helpline → temporary password → forced change). SMS/OTP not built; the provider is your choice. |
| Forced change | `must_change_password` | KEEP; only for system-generated passwords |

---

## 9. Targets and measurement

| Target | Baseline (estimated from code) | Method |
|---|---|---|
| Registration < 5 min, ≤ ~25 non-typing taps | ~45+ (12 address fields, per-document files, stepper, date-picker) | Timed run with a prepared profile |
| Pay a fee ≤ 4 taps | Other fees: 6–8 | Home → পেমেন্ট করুন → pick due → method+TrxID → confirm |
| Common task ≤ 2 taps from Home | Up to 3 + scrolling 21 items | Tap-path table per task |
| First useful screen < 3 s on "Slow 4G" | Not measured. Risks: four font families, global Leaflet CSS, QR library in the shell, bundle over the 512 kB budget | Lighthouse + DevTools throttling, before/after |

## 10. Screenshots

**Not captured yet.** This needs the app running with demo data. I don't touch databases, so either you start a dev environment with demo data, or I write a seed script for you to run. Planned slots (360×800 phone + desktop, BN mode): Home, Registration steps 1–6, the three payment pages, Plot map, Admin dashboard, Payment verifications, Fee settings, Login, saved to `docs/ux-screenshots/before/` and later `after/`.

## 11. Usability test plan (5 members incl. 2 older/low-tech)

- **Tasks:** register with a prepared paper khatian · find what you owe · pay an installment with a bKash TrxID · read the latest notice · find your plot on the map · reset your password.
- **Setup:** their own Android phone on mobile data, BN mode, a staging server, think-aloud. The observer logs hesitations > 5 s, wrong taps and help requests.
- **Measure:** completion, time, taps, errors, and a 1–5 ease rating in Bangla.
- **Output:** fix the top 5 issues, retest with 2 members, and append the results here.

## 12. Implementation batches (after sign-off)

0. Foundation: feature flags, `bn` locale + `bnDate` / `taka` / `bnNumber` pipes, error catalogue, image-compression utility
1. Registration (Angular + Flutter + additive migrations `has_whatsapp`, `consent_version`, `needs_office_help`)
2. Payments merge
3. Navigation + Home
4. Map wizard
5. Admin console (incl. the permission fix)
6. Login / accounts
7. Performance / accessibility (Hind Siliguri only, subset; 16–18 px base; ≥ 48 px targets; "লেখা বড় করুন"; offline banner; data-saver)

Each batch ships with before/after screenshots, build and test status, metrics, and UI tests. The constitution traceability matrix is updated where a section changes.

## 13. Sign-off record (2026-10-13)

- **R2–R10 approved**, each behind a feature flag first. R9/R10: move, never delete.
- **R1 withdrawn.** Email stays mandatory in the server and the form, and all email logic is unchanged (required field, reset by email link, email notifications). Fix: the form builder and the step validators must **both** enforce email.
- **R5:** a property cannot be approved until an admin has filled in the dag (badge "দাগ দরকার").
- **R8:** min 8 characters plus a small common-password blocklist; the policy also applies on the reset page.
- **Photo:** required at registration and enforced on the server; admins may upload one on the member's behalf during review.
- **Login (Batch 6):** one field, "মোবাইল / ইমেইল / সদস্য আইডি", accepting a mobile number, email, member ID or username. Phone formats are normalised (`01…`, `+8801…`, Bangla digits). Before phone login is enabled, existing data is checked for duplicate mobiles; if a mobile matches more than one account, the member is asked to use email or member ID instead. The wrong-credentials message is generic, and rate limiting is kept.
- **Admin-assisted password reset:** not in this round. The email reset stays as it is (§8 row superseded).
- **Helpline / WhatsApp:** admin-editable settings; the help button stays hidden until they are set.
- **Screenshots:** via a seed script with fake data only, run by the owner on staging, never production.
- **Order:** (1) admin installments/fee-payments permission fix, (2) cache docs and wiring as a separate change, (3) Batch 0.

**Update (2026-10-13, after staging passed):**
- **Members abroad — address:** a "বিদেশে থাকি" toggle for the current address (country, city, free-text address). The permanent address stays in Bangladesh.
- **Members abroad — payment:** same methods as everyone else, plus a note that a relative in Bangladesh may pay on the member's behalf; TrxID/receipt and screenshot as usual. No international transfer option.
- **Helpline / WhatsApp:** left blank; the help button stays hidden until an admin enters numbers.
- **Screenshots:** not required ("no need this portion"); batches report build/test status and metrics only.
- **Branching:** work is pushed to `origin/staging`, not `main`.

**Defaults adopted so Batches 2–7 can proceed ("complete all"; each is reversible, flagged and open to owner review):**
- **B2-R1, other-fee verification:** **not built**. Other fees keep today's "recorded" behaviour until the owner decides.
- **Batch 4 (map):** disputed shapes keep their base colour plus a label; "মানচিত্র দেখুন" is remembered per session; a member who can't find their dag can skip to free drawing.
- **Batch 5 (admin):** bulk approve returns per-item results, guarded by the confirmed count and total; committee "expiring soon" = 60 days; no cache-flush button in the UI; Asset Register under সংগঠন › আরও.
- **Batch 6 (login):** a mobile shared by several accounts asks for email or member ID; member-email login sits under `login_by_phone`; no own-mobile/member-ID password rule.
- **Batch 7 (performance and accessibility):**
  - Fonts: Google-hosted Hind Siliguri only, with no font files downloaded into the repo; Flutter keeps the system font.
  - Bundle error budget: 550 kB.
  - "লেখা বড় করুন": one step (18 px).
  - No new dependencies.

## 14. Implementation status (2026-10-15)

All seven batches are implemented in the backend, Angular and Flutter. Every change sits behind a feature flag that is **off by default**.

| Batch | Flags | Status |
|---|---|---|
| 0 Foundation, 0b international phones | — | Done |
| 1 Registration | `reg_*` (8 flags) | Done |
| 2 Payments merge | `pay_merged_page` | Done |
| 2b Other-fee verification (B2-R1) | `pay_verify_other_fees` | Done in the backend, Angular and Flutter. Off by default; existing fee and picnic rows stay "approved". |
| 3 Navigation and home | `nav_five_areas`, `nav_merged_entries` | Done. `nav_advanced_section` is applied in Batch 5. |
| 4 Map wizard | `map_wizard` | Done |
| 5 Admin console | `admin_console`, `admin_bulk_verify`, `fee_wizard`, `nav_advanced_section` | Done, including the fee-rate wizard in Angular and Flutter |
| 6 Login and passwords | `login_by_phone`, `password_policy_v2` | Done |
| 7 Performance and accessibility | `ui_a11y_v2`, `data_saver`, `net_status_banner` | Done |

**Migrations to apply on staging, in order:** `a7c3e9b1d5f2` (flags) → `b4d6f8a0c2e5` (phones) → `c1e5a9d3b7f4` (registration) → `d2f6b0a4c8e1` (cost-share payments) → `e3a7c1b5d9f2` (settings) → `f5b8d2a6c1e7` (reject reasons) → `a8c2e4f6b1d3` (other-fee verification). Run the phone dry-run first. Run `python -m scripts.report_duplicate_mobiles` before switching on `login_by_phone`.

**Measured:**

| Metric | Result |
|---|---|
| Angular initial bundle | 522.23 kB → **486.79 kB** (budget 500 kB; error limit now 550 kB) |
| Font families loaded | 4 → 1 (Hind Siliguri 400/600/700) |
| Pay a fee from Home | **4 interactions** (component test) |
| Every former member menu page | Reachable from the five areas (mapping-guard test fails otherwise) |
| Tests | Backend 1093 pass (2 older failures, below); Angular 1180 of 1180; Flutter 1077 of 1077 |

**Not measured, because it needs real people or devices:**
- Registration under 5 minutes and about 25 taps for a prepared member.
- First useful screen under 3 s on Slow 4G.
- The usability test with 5 members (§11).
- The camera, file picker, clipboard and native image compression on a real phone.

**Known gaps:**
- Flutter now has the help desk, complaints (incl. land protection), service standard, elections, petitions, welfare fund and amendments pages, all listed in the "সংগঠন" hub. Not ported: election complaints, PDF downloads (land-form copy, welfare decision letter, amendment certificate).
- The Flutter admin pages now match Angular: "আজকের কাজ", search, bulk approve, the merged applications queue, notices + events, phone fixes, cache stats (no flush button) and the fee-rate wizard.
- The fee-rate wizard changes fixed-amount fees only. Tiered, per-head and variable fees stay under "আরও অপশন".
- Intermittent test: once, during a heavy parallel run, the Angular "other-fee tab" test showed a translation key instead of Bangla text. It passed alone three times and in two further full runs.

**Fixed while finishing:**
- **Scheduled rates left a gap.** When a new fee rate was scheduled for a future date, the old rate was closed on the day the change was made. The days in between had no rate, and subscription quotes failed with 409 (`SUBSCRIPTION_RATES_NOT_CONFIGURED`). The old rate now runs until the day before the new one starts. This affected both the fee-settings and the fee-type version endpoints and could have occurred in the existing form, not only in the new wizard.
- **Angular production build was broken** at commit `87077cd` (a missing import in `app.ts`), although the tests passed. Fixed.
- **Change-password v2 spec** reconfigured an already-created test module in two tests. Fixed.
- Two backend tests fail on `main` without these changes (resolution-book audit test, CORS preflight test).

## 15. Original questions (answered in §13)

1. R1–R10: yes or no for each.
2. Is the photo required at registration? (The form builder says yes, the server says no.)
3. Society helpline number and WhatsApp for the "সাহায্য দরকার?" button.
4. Screenshots: will you run a demo-data dev environment, or should I write a seed script for you to run?
5. Admin-assisted reset now, SMS/OTP provider later: agreed?
