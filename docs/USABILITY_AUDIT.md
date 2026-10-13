# Usability Audit: Uttar Kaundia Society Web App

**Date:** 2026-10-13. **Status:** Step 1. Awaiting approval. No code has been changed.
**Method:** I read the code only (`frontend/src/app`, `backend/app/core/permissions.py`, `docs/constitution*`). I have not yet done device tests, Slow‑3G tests or Lighthouse runs; those belong to Step 4.
**Test for every screen:** can a 55‑year‑old plot owner on a mid‑range Android phone with a slow connection finish the task in under a minute without help?

**Decisions used in the tables**
- **KEEP:** leave as it is.
- **SIMPLIFY:** keep, but cut steps, words and controls.
- **MERGE:** fold into another screen.
- **HIDE:** keep, but behind a flag or admin setting, OFF for members by default.
- **REMOVE:** take out of the UI and routes, with a redirect from the old link. Data and audit history are kept.

**⚖ = required by the গঠনতন্ত্র or by law.** These can be simplified but must not be removed. Source: `docs/constitution-traceability.md`, which is based on the 1961 Voluntary Social Welfare Agencies Ordinance, DSS rules and the Land Crime Prevention Act 2023.

---

## 1. Summary

The translations are in good shape: 2,889 keys in both bn and en, none missing, and only 13 hard‑coded English strings. Bangla is already the default language. The real problems are elsewhere:

1. **Too many items in the menu.** A member sees **21 sidebar items** in 3 groups. A super‑admin sees 38, and there are 46 in total. There is no bottom bar on mobile, no help button and no first‑time tour.
2. **Four different ways to pay, none complete.**
   - Installments: a 3‑step dialog with transaction ID and proof.
   - Other fees: no transaction ID and no proof.
   - Cost shares: no way to pay at all.
   - Registration: optional receipt and no transaction ID.
3. **Raw backend error text reaches members** in about 30 places (`err.error.detail`). There is no shared error handler. Login shows the same message for a wrong password, no internet and "account not yet approved".
4. **Bangla mode still shows English digits and month names.** `LOCALE_ID` is never registered. 59 `date`/`number` pipes and the `toLocaleString('en-IN')` calls render in English. ৳ formatting is written separately in 61 places.
5. **Registration drafts can stop saving without warning.** Uploaded files are stored inside the draft in `localStorage`. Once the browser's limit (about 5 MB) is reached, saving stops but the "saved" indicator stays on. Registration also asks for 12 required address fields with no "same as permanent address" option, and email is required.
6. **Uploads are never compressed.** This affects photos, receipts, documents and recordings. There is no PWA or offline support. Leaflet and geoman CSS load on every page. The QR code library for the ID card is in the shell bundle.
7. **Accessibility.** Form fields and buttons are 36–40 px tall; the target is 44–48. There are many text sizes of 10–12 px. Dark mode already works.
8. **Advanced tools are shown to members by default.** The plot map shows BDS dag, the RS overlay, layers, snapping and drawing (about 20 buttons). Fund transparency is an analyst dashboard with about 12 filters.
9. **Possible security issue (not usability).** `/installments-management` and `/fees-management` are protected only by the "view members" permission (`member.view_all`), so anyone who can view the member list can see finance data. This should be a separate fix.

---

## 2. Member‑facing screens

| # | Screen / route | Who uses it | Task | Problems found | Decision |
|---|---|---|---|---|---|
| 1 | Registration `/register` (6 steps) ⚖ | Every new member, once | Apply for membership | <ul><li>12 required address fields with no "same as permanent" option.</li><li>Email required.</li><li>Photo and documents not compressed.</li><li>Draft can silently stop saving when storage is full.</li><li>Drafts are tied to one device and never expire.</li><li>Payment step has no transaction ID.</li><li>Unused `memberSignature` control.</li><li>Up to 9 properties, each with document uploads.</li></ul> | **SIMPLIFY.** <ul><li>Add a "same as permanent" toggle.</li><li>Make email optional.</li><li>Save files to the server, not into the draft.</li><li>Warn when a draft fails to save.</li><li>Use the shared payment step.</li><li>Put one question group per screen on mobile.</li><li>Move optional fields (occupation, holding no., joint owners) to the profile.</li></ul> |
| 2 | Login `/login` | Everyone | Sign in | <ul><li>One error for every failure.</li><li>Disabled button with no reason given.</li></ul> | **SIMPLIFY.** Separate messages for: wrong password, no internet, and pending approval. |
| 3 | Dashboard `/dashboard` | Every member, daily | See what to do | <ul><li>Member ID shown twice.</li><li>All 8 quick tiles shown even when the member lacks permission, so some lead to a 403 page.</li><li>No single "what to do now" prompt.</li></ul> | **SIMPLIFY.** <ul><li>Show: dues to pay now with a pay button, latest notice, next event, and one "কী করবেন" prompt.</li><li>Show tiles only for permitted features.</li></ul> |
| 4 | Profile `/profile` | Every member | View and correct my details | <ul><li>4 competing primary buttons.</li><li>Upload not compressed.</li><li>Raw backend errors.</li><li>Data correction requests overlap the property edit flow.</li></ul> | **SIMPLIFY.** <ul><li>One primary action.</li><li>Move Change password inside the profile.</li><li>Merge My data with property edits.</li></ul> |
| 5 | Change password `/change-password` | Rare | Change password | <ul><li>Has its own sidebar item.</li><li>No loading state.</li></ul> | **MERGE** into Profile. |
| 6 | ID card (modal) | Members, occasionally | Show or download card | QR library loads for every user. | **KEEP**, but load the QR library only when the card is opened (`@defer`). Link it from Profile and Home. |
| 7 | Installments `/installments` ⚖ (subscription, ধারা ৬৬) | Every member, monthly | Pay monthly dues | <ul><li>Best flow of the four.</li><li>Payment method shown as a raw code.</li><li>English digits.</li><li>Receipt not compressed.</li><li>Raw backend errors.</li></ul> | **MERGE** into **আমার পেমেন্ট** (shared flow, see §5). |
| 8 | Other fees `/other-fees` (+ `/fees`, `/picnic-payment`) | Members, a few times a year | Pay a one‑off fee | <ul><li>About 14 inputs.</li><li>No proof upload and no transaction ID.</li><li>Member types the amount for variable fees.</li><li>Small −/+ buttons.</li><li>Raw dates.</li></ul> | **MERGE** into **আমার পেমেন্ট**. |
| 9 | Cost shares `/cost-shares` | Members with a share | See my share of society costs | <ul><li>Shows money owed with no way to pay.</li><li>Raw category codes.</li><li>ISO dates.</li></ul> | **MERGE** into **আমার পেমেন্ট**, with a pay button on each item. |
| 10 | Resolution book `/resolution-book` ⚖ (ধারা ৬২, ৭৫) | Members read; committee writes | Read meeting decisions | <ul><li>Meeting form has 20 inputs (committee only).</li><li>Raw errors.</li><li>Uncompressed recording uploads.</li></ul> | **SIMPLIFY.** Members get a read‑only list under **স্বচ্ছতা → সভার সিদ্ধান্ত**. Add/edit stays in admin. |
| 11 | Neighbours `/neighbours` ⚖ (opt‑in, ধারা ৭৬) | Few | Contact neighbours | Rarely used, but has its own sidebar item. | **MERGE** as a tab under **আমার প্লট**. |
| 12 | Plot map `/plot-map` | Members, occasionally | See my plot | <ul><li>About 480 kB of map code.</li><li>BDS/RS dag tabs, RS overlay, layers, snapping and drawing all visible.</li><li>About 20 buttons.</li><li>Leaflet CSS loads on every page.</li></ul> | **SIMPLIFY + HIDE.** <ul><li>The default view is **আমার প্লট দেখুন**: my plot highlighted, plus a legend.</li><li>BDS, RS, layers and drawing go behind an **উন্নত** toggle, OFF by default.</li><li>The committee decides whether members may draw (see §8).</li></ul> |
| 13 | Fund transparency `/fund-transparency` ⚖ (audit publication, ধারা ৭৩) | Interested members | See where money goes | <ul><li>About 12 filters, 19 buttons and 5 charts.</li><li>Shows reversal and reference jargon.</li></ul> | **SIMPLIFY.** <ul><li>Show 3 numbers (income, spending, balance), one chart, the last 10 entries and the audit report.</li><li>The full ledger goes behind "বিস্তারিত দেখুন".</li></ul> |
| 14 | Roadmap `/roadmap` | Members, occasionally | See society plans | Fine. | **KEEP** under **স্বচ্ছতা**. |
| 15 | Notices `/notices` ⚖ (AGM notice, ধারা ৫৯) | Every member | Read notices | Dates use English month names. | **MERGE** with Events into **নোটিশ ও ইভেন্ট**. |
| 16 | Events `/events` | Every member | See upcoming events | Same as notices. | **MERGE** (as above). |
| 17 | Membership `/membership` ⚖ (application, appeal ধারা ৩৬, ৪৩) | Rare (approved members) | Applications, appeals, waivers | <ul><li>7 sections, 16 inputs, 4 tables, 4 primary buttons on one page.</li><li>"Apply" duplicates public registration.</li></ul> | **SIMPLIFY.** <ul><li>Split into **আমার আবেদন** (status list with a pending notice, e.g. "সাধারণত ২০ কর্মদিবস") and simple forms that open one at a time.</li><li>Remove the duplicate "apply".</li></ul> |
| 18 | Property request `/property-requests/new` | Few | Add or edit land | 13 inputs that repeat registration step 2. | **SIMPLIFY.** Reuse the registration property step component. Reach it from **আমার প্লট**. |
| 19 | Complaints `/complaints` ⚖ (ধারা ৭৯) | Some | Complain | <ul><li>One of 5 separate grievance entry points.</li><li>Land protection form has 15 inputs.</li></ul> | **SIMPLIFY + MERGE.** One **অভিযোগ / আবেদন** page with clear choices: general, land protection, election, appeal. Show the complaint number and when it was received. |
| 20 | Emergency help `/emergency-help` | Rare but urgent | What to do if land is grabbed | Static, fine. | **MERGE** into the new **সাহায্য** page. |
| 21 | Service standard `/service-standard` | Rare | Know response timelines | Has its own sidebar item. | **MERGE** into **সাহায্য**. |
| 22 | Elections `/elections` ⚖ (ধারা ৫৮) | All voters at election time | Check voter list, vote, see results | <ul><li>Raw `memberId` fallback.</li><li>Visible all year round.</li></ul> | **HIDE until relevant.** Show it in the sidebar and on Home only while an election is open. |
| 23 | Petitions `/petitions` ⚖ (⅕ petition, ধারা ৫৯) | Very few | Petition for a special meeting | <ul><li>Members must type a petition ID to sign.</li><li>No admin page exists.</li></ul> | **SIMPLIFY + HIDE.** <ul><li>Members sign by tapping from a list.</li><li>Reach it from **অভিযোগ / আবেদন**.</li><li>Show it on Home only while a petition is open.</li></ul> |
| 24 | Welfare fund `/welfare-fund` | Few (in need) | Apply for help | Raw errors. Name is confusingly close to "Fund transparency". | **KEEP**, renamed **সাহায্যের আবেদন** and moved under **অভিযোগ / আবেদন**. |
| 25 | Amendments `/amendments` ⚖ (ধারা ৮৫–৮৬) | Very few, only during a proposal | Read or comment on proposed amendments | Raw errors. Has its own sidebar item. | **HIDE until relevant.** Shown under **স্বচ্ছতা** only when a proposal is open. |

---

## 3. Admin and committee screens

Overall: 27 admin pages in 2 groups. Admin users are fewer and more experienced, so the goal here is **fewer duplicate pages and plain labels**, not hiding features.

| # | Screen / route | Permission | Task | Problems | Decision | New label (bn) |
|---|---|---|---|---|---|---|
| A1 | Submissions `/submissions` + detail | membership.review | Review registrations | <ul><li>Same job as A3.</li><li>Detail page is about 2,000 LOC.</li><li>Raw status code.</li></ul> | **MERGE** with A3 | নতুন সদস্য আবেদন |
| A2 | Property requests `/property-requests` | property.review | Approve land changes | Third separate approval queue | **MERGE** into one approval inbox (tabs) | অনুমোদনের অপেক্ষায় |
| A3 | Membership review `/membership-review` ⚖ (20 days) | membership_application.manage | Decide applications | Duplicates A1 | **MERGE** with A1 | (as A1) |
| A4 | Membership governance `/membership-governance` ⚖ (appeals ৪৩) | waiver / suspension | Waivers, suspensions, appeals | <ul><li>4 workflows on one page.</li><li>Fragile key concatenation.</li><li>Not linked to rejections.</li></ul> | **SIMPLIFY**: tabs inside the approval inbox, plus a link from the rejection | ছাড়, স্থগিত ও আপিল |
| A5 | Members list `/members` ⚖ (register ৭৫) | member.view_all | Member register | Raw status code in the drawer | **KEEP** (translate the status) | সদস্য তালিকা |
| A6 | Installments mgmt `/installments-management` | member.view_all ⚠ | Installment plans | <ul><li>Finance page behind a view‑only permission.</li><li>Overlaps A7 and A8.</li></ul> | **MERGE** into A7 and fix the permission | — |
| A7 | Fee payments `/fees-management` | member.view_all ⚠ | Dues ledger | <ul><li>Picnic payments mixed in.</li><li>Weak permission.</li></ul> | **MERGE** with A6 and A9 | সদস্যদের পেমেন্ট |
| A8 | Fee settings `/fee-settings` ⚖ (৬৬) | manage_fee_settings | Fee formula | <ul><li>Jargon ("base threshold").</li><li>"Close" button label in English.</li></ul> | **SIMPLIFY** wording | ফি নির্ধারণ |
| A9 | Payment verifications `/payment-verifications` | manage_finance | Verify proofs | Raw method code | **MERGE** as the first tab of A7 | পেমেন্ট যাচাই |
| A10 | Society costs `/society-costs` | manage_costs | Record expenses | Overlaps A11 (categories and entries) | **MERGE** into A11 | — |
| A11 | Finance management `/finance-management` ⚖ (৪৫, ৭৩) | manage_finance | Ledger and approval | About 1,600 LOC with jargon | **SIMPLIFY + MERGE** (A10 and A12 become tabs) | হিসাব ও খরচ |
| A12 | Fund controls `/fund-controls` ⚖ (৬৯, ৭৩) | fund / signatory | Bank, signatories, audit | Jargon | **MERGE** as a tab of A11 | ব্যাংক ও অডিট |
| A13 | Plot boundaries `/plot-boundaries` | boundary.review | Review boundaries | Heavy GIS | **KEEP** (surveyor and admin tool) | প্লট সীমানা যাচাই |
| A14 | Roles `/roles` | manage_roles | RBAC | About 30 raw permission keys | **SIMPLIFY**: show a readable label beside each key | ভূমিকা ও অনুমতি |
| A15 | Roadmap mgmt `/roadmap-management` | manage_roadmap | Edit roadmap | — | **KEEP** | পরিকল্পনা হালনাগাদ |
| A16 | Notices mgmt / events mgmt | manage_notices | Publish | Near‑duplicate forms | **MERGE** into one page with a type selector. Add an "AGM notice" type (ধারা ৫৯). | নোটিশ ও ইভেন্ট প্রকাশ |
| A17 | Audit log `/audit-log` ⚖ (edit history ৭৫) | view_audit_log | Trace changes | Raw action codes | **KEEP** (translate the action codes). Super‑admin only. | পরিবর্তনের ইতিহাস |
| A18 | Config lists `/config-lists` | manage_system_config | Dropdown values | Raw codes | **HIDE** under a Settings sub‑menu | তালিকা সেটিংস |
| A19 | Committee registry ⚖ (৪৬) | committee_registry.manage | Committee posts | — | **KEEP** | কমিটি |
| A20 | Elections admin ⚖ (৫৮) | election.manage | Run elections | Heavy | **KEEP**, add a step‑by‑step wizard later | নির্বাচন পরিচালনা |
| A21 | Complaints admin ⚖ (৭৯) | complaint.* | Handle complaints | 5 tabs | **SIMPLIFY**: default to an "action needed" view | অভিযোগ নিষ্পত্তি |
| A22 | Amendments admin ⚖ (৮৫) | amendment.manage | Track amendments | Weak empty states | **KEEP** | গঠনতন্ত্র সংশোধনী |
| A23 | Asset register ⚖ (৭৪) | asset_register.manage | Assets | Raw category code | **KEEP** | সম্পদ তালিকা |
| A24 | Welfare activities | welfare_activity.manage | Welfare records and aid requests | Overlaps welfare‑fund review | **MERGE** with welfare‑fund review | কল্যাণ কার্যক্রম |
| A25 | Admin dashboard (embedded) | — | Overview | Raw category; repeats finance figures | **SIMPLIFY**: show only "pending approvals: N", "payments to verify: N" and "open complaints: N" | — |
| — | **Missing:** AGM / meeting / quorum / petition admin ⚖ (৫৯, ৬১) | — | — | No page exists | **Build later**: a separate decision, not part of this simplification | সভা ও কোরাম |

### Governance features ranked by expected member use

| Rank | Feature | Who uses it | Required? | Placement |
|---|---|---|---|---|
| 1 | Elections (voter list, vote, results) | All voters, once every 3 years | ⚖ ৫৮ | Shown only during an election |
| 2 | Complaints | Some members, occasionally | ⚖ ৭৯ | **অভিযোগ / আবেদন** |
| 3 | AGM notice and attendance | All, once a year | ⚖ ৫৯ | Notices (AGM type) |
| 4 | Membership appeal | Rejected applicants only | ⚖ ৪৩ | Inside **আমার আবেদন** |
| 5 | Welfare aid request | A few in need | — | **অভিযোগ / আবেদন** |
| 6 | Petition (⅕ for extraordinary meeting) | Very few | ⚖ ৫৯ | Only while a petition is open |
| 7 | Amendments | Very few | ⚖ ৮৫ | Only while a proposal is open |
| 8 | Quorum tracking | Officers only | ⚖ ৬১ | Admin only (to be built) |

---

## 4. Navigation: before and after

| Role | Sidebar items today | Proposed | Mobile bottom bar |
|---|---|---|---|
| member | **21** (3 groups) | **7** | 5 |
| executive_committee | 30 | about 14 (5 member + 9 admin) | 5 |
| administrator | 22 | about 12 | 5 |
| super_admin | 38 | about 17 | 5 |

**Proposed member sidebar (bn first)**
1. **হোম**: dues, latest notice, next event, কী করবেন.
2. **আমার পেমেন্ট**: monthly dues, other fees and cost shares in one place, plus payment history.
3. **নোটিশ ও ইভেন্ট**
4. **আমার প্লট**: plot view, with neighbours and property requests as tabs. The উন্নত toggle is OFF by default.
5. **স্বচ্ছতা**: fund summary, roadmap, meeting decisions (সভার সিদ্ধান্ত), and amendments only while a proposal is open.
6. **অভিযোগ / আবেদন**: complaints, land protection, welfare aid, my applications and appeals, and petitions.
7. **আমার প্রোফাইল**: details, ID card, change password.
- **সাহায্য**: a fixed button on every page, not a sidebar item. It gives a page explanation, the committee phone number and WhatsApp, emergency steps and service standards.
- **নির্বাচন** appears as an 8th item only while an election is open.

**Mobile bottom bar:** হোম · পেমেন্ট · নোটিশ · প্লট · প্রোফাইল.

**Admin sidebar:** grouped into **অনুমোদন** (approval inbox), **সদস্য**, **পেমেন্ট ও হিসাব**, **প্রকাশ** (notices, events, roadmap), **শাসন** (committee, elections, complaints, amendments, assets, welfare) and **সেটিংস** (fees, roles, lists, audit log).

**Redirects:** every old URL redirects to its new location, e.g. `/other-fees` → `/payments?tab=fees`, `/neighbours` → `/my-plot?tab=neighbours`, `/submissions` → `/approvals`. The existing redirects `/fees`, `/picnic-payment` and `/picnic-payments` are pointed at the new targets.

---

## 5. Shared payment flow (one design for all member payments)

**Screen 1:** pick what to pay, then see **কত টাকা** in large ৳ with Bangla digits. The member never types or calculates an amount; variable fees are set by the admin.

**Screen 2:** choose **কীভাবে দিবেন**: নগদ (cash) / বিকাশ / নগদ (Nagad) / রকেট / ব্যাংক. Only the methods the committee approves are shown (see §8). The selection then shows the account number with a copy button.

**Screen 3:** add **প্রমাণ**. A transaction ID is required for mobile and bank payments and hidden for cash. Take a photo or choose a receipt; it is compressed on the phone to about 300 KB, with a progress bar.

**Then:** a summary to confirm, followed by "যাচাইয়ের অপেক্ষায়" (awaiting verification) with the expected time. If the upload fails, the entered data is kept and a retry button appears.

**Target:** pay a fee in 3 screens or 5 taps or fewer, from Home.

---

## 6. Cross‑cutting fixes

| Area | Fix |
|---|---|
| Errors | Add one global HTTP error interceptor that maps status and network failures to plain Bangla, e.g. "ইন্টারনেট সংযোগ নেই। আবার চেষ্টা করুন।" Stop showing `err.error.detail` directly. Add a shared `<app-error-state>` with a retry button. |
| Empty states | Turn the `.empty-state` CSS into a shared `<app-empty-state>` component that says what will appear here and what to do next. |
| Digits, ৳ and dates | Register the `bn` locale and `LOCALE_ID`. Add shared `bnNumber`, `taka` and `bnDate` pipes that follow the language switch. Replace the 2 duplicated `localizeDigits` helpers and the inline ৳ formatting. |
| Leftover English | Fix the 13 hard‑coded strings and translate the raw status, method and category codes on screen. Move the 45 inline `lang === 'bn' ? …` ternaries to keys. `keys.tsv` is out of date (1,793 lines vs 2,889 keys): regenerate it or remove it. |
| Readability | Body text at least 16 px. Remove 10–12 px text from member screens. List the Bangla font first, so the order is `'Hind Siliguri'`, then Inter. |
| Tap targets | Raise `--field-height` and buttons to 48 px, with a minimum of 44 px everywhere. |
| Performance | <ul><li>Load leaflet and geoman CSS only on map routes.</li><li>Load the QR code library only when the ID card opens (`@defer`).</li><li>Check whether turf is pulled in through `geo.helper.ts`.</li><li>Add a PWA service worker that caches the app shell and translations.</li><li>Compress images on the phone before upload, everywhere.</li></ul> |
| Help and tour | <ul><li>Add a সাহায্য button on every page, with a 2–3 sentence Bangla explanation per page plus phone and WhatsApp contacts.</li><li>Add a 4‑step first‑time tour that can be skipped.</li></ul> |
| Pending status | Every item awaiting approval shows a status line with the typical waiting time. |
| Security (separate) | Re‑guard the installments and fees admin pages with `manage_finance`. |

---

## 7. Top 5 member tasks: estimated taps today vs target

| Task | Today (estimated from code) | Target |
|---|---|---|
| Pay a fee | Monthly dues: menu → Installments → pay → 3 dialog steps, about 8–10 taps, plus typing. Other fees: about 14 inputs. | ≤ 3 screens / 5 taps |
| Check dues | Menu → Installments, and separately Cost shares (2 places) | 0 taps (shown on Home) |
| Read a notice | Menu → scroll the 21‑item list → Notices → item | Home → tap the latest notice (1 tap) |
| View my plot | Menu → Plot map (480 kB, about 20 controls) | Bottom bar → প্লট (1 tap, simple view) |
| Update my profile | Menu → Profile → choose among 4 primary buttons | Bottom bar → প্রোফাইল → সম্পাদনা |

I will measure these on a real device in Step 4.

---

## 8. Questions for the committee before anything is removed

1. **Required features.** This report marks ⚖ items using `docs/constitution-traceability.md`. Please confirm or correct the list.
2. **Map tools.** Should members still be able to draw their own boundary (`boundary.draw_own`) behind the উন্নত toggle? Or should drawing move to surveyors and admins only?
3. **Payment methods.** Which methods do members actually use: cash, bKash, Nagad, Rocket, bank? Only those will be shown.
4. **Registration email.** Can email be optional?
5. **Fund transparency.** Is a simple summary plus the audit report enough for members, with the full ledger one tap away?
6. **Welfare.** Should welfare aid requests be visible to all members, or only on request?
7. **AGM, quorum and petition admin.** These are required but do not exist yet. Build them now or later? This is out of scope for the simplification.

---

## 9. Implementation batches (after approval)

1. Navigation: new sidebar, mobile bottom bar, redirects, সাহায্য button.
2. Shared foundations: error interceptor, empty and error states, Bangla number, ৳ and date pipes, 48 px controls.
3. Home dashboard.
4. **আমার পেমেন্ট**: shared payment flow and upload compression.
5. Registration: fix the draft, address toggle, fewer fields.
6. Plot map simple view and উন্নত flag; fund transparency summary.
7. Merge the admin pages: approval inbox, payments, finance, notices and events.
8. Feature flags for seasonal items (elections, petitions, amendments), tour, PWA.
9. Step 4 verification: taps, Lighthouse, Slow 3G, role regression, tests with 5 members.

Rules for all batches:
- No database tables or data are deleted.
- All role checks and audit logging stay in place.
- Every old URL redirects to its new location.
