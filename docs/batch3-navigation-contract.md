# Batch 3 — Navigation + Home: shared contract (backend · Angular · Flutter)

Source: [`ux-simplification-audit.md`](ux-simplification-audit.md) §4, §9 and §13. R9 and R10 entries move but are never deleted. The helpline is blank for now, so the help button stays hidden.
**Rule:** with every new flag **off**, today's behaviour is unchanged. No page or route is deleted.

## Flags

| Key | Status | Covers |
|---|---|---|
| `nav_merged_entries` | Exists, now wired | R9: Emergency help becomes the floating help button. Service standard and the land-protection complaint move into "অভিযোগ / সাহায্য". |
| `nav_five_areas` | **New**, default off | Five-area member navigation (bottom bar below 960 px, sidebar on desktop), the "আমার অবস্থা" home, the header "বাংলা \| English" switch, and the theme toggle moved to Profile |
| `nav_advanced_section` | Exists, **built in Batch 5** | Admin menu: four groups + Advanced. It depends on the admin console and the merged notices/events page. |

`nav_five_areas` does not depend on `nav_merged_entries`. The "পেমেন্ট" tab goes to `/payments` when `pay_merged_page` is on, otherwise to `/installments`.

## Mapping (every current member item in `NAV_SECTIONS`; every route kept)

| Area | Contents |
|---|---|
| **হোম** `/dashboard` | "আমার অবস্থা" |
| **পেমেন্ট** `/payments` | Installments, other fees, cost shares (Batch 2) |
| **আমার জমি** `/my-land` (new hub) | Property requests and document checklist, Neighbours, Plot map |
| **সংগঠন** `/organisation` (new hub) | Notices, Events, "সভার সিদ্ধান্ত", "আয়-ব্যয়ের হিসাব", "আমাদের পরিকল্পনা", Elections (pinned to the top during an active election), Welfare fund, "অভিযোগ / সাহায্য" (with `nav_merged_entries`: my complaints, land-protection complaint and service standard together), and "আরও" → Petitions, Amendments |
| **আমার প্রোফাইল** `/profile` | Profile and ID card, "আমার সদস্যপদ", change password, theme, logout |
| Floating **"সাহায্য দরকার?"** | Opens a sheet: call, WhatsApp, "হেল্প ডেস্ক" → `/emergency-help`. Hidden while the helpline is empty or `nav_merged_entries` is off (in that case the old menu entry stays). |

Hubs are lightweight tile pages. Tiles use the same permission rules as the old menu items. Sub-pages highlight their parent tab through route `data.area`, falling back to a URL prefix match.

## Angular

- **`shell.component.ts`:**
  - add `MEMBER_AREAS`;
  - when the flag is on, a computed signal switches between `NAV_SECTIONS` and `MEMBER_AREAS` + the unchanged admin sections;
  - below 960 px: a fixed bottom bar with five targets of at least 56 px, labels always shown, safe-area padding, and admin sections in the drawer;
  - add bottom padding so the bar never covers content.
- **Header:** a "বাংলা \| English" segmented control (`aria-pressed`), also on the public pages. The theme toggle moves to Profile › "প্রদর্শন".
- **`shared/help-fab`:** uses `HelplineService` (cached), shown for member-tier users only, with `tel:` and `wa.me` links.
- **Home (`home-status` component, used when `nav_five_areas` is on):**
  1. Status card with the next step: pending → "অফিস যাচাই করছে"; `needs_dag` → "অফিসে দাগ নম্বর দিন"; dues → "বকেয়া ৳… — পেমেন্ট করুন"; otherwise "সব ঠিক আছে".
  2. Dues card using `/api/member/payments/summary`, or `/installment-payments/payable` if Batch 2 is off.
  3. Latest notice.
  4. Next event.
  5. A 2×3 grid of big icon buttons.

  No tables. Each card loads on its own, with a skeleton and a retry. The old dashboard stays for flag off.
- **Admin:** a "হেল্পলাইন" card on the system-config screen (`manage_system_config`).

## Flutter

- **`nav_items.dart`:** add `memberAreas(flags)` and an `area` field on `NavItem`.
- **`shell_page.dart`:** the `NavigationBar` uses the five areas when the flag is on.
- **New pages:** `my_land_hub_page.dart`, `organisation_hub_page.dart`, `home_status_page.dart`.
- **Help:** a `FloatingActionButton.extended`, hidden while the helpline is empty.
- **Language and theme:** the language switch goes in the AppBar; the theme toggle moves to the profile page.
- **`core/helpline/helpline_repository.dart`**

## Backend: helpline settings

Additive migration: table `app_settings` with `key` (str 64, PK), `value` (JSON), `updated_by` (FK admin_users SET NULL) and `updated_at`. No seed row.
The service lives in `services/app_settings.py`, with keys limited to an allow-list `{"helpline"}`.

- `GET /api/public/helpline` — no auth, cached in `public_lists` and invalidated when `app_settings` is written. Returns `{"phone": str|null, "whatsapp": str|null, "hours_text": str|null, "enabled": bool}`, where `enabled` = phone or whatsapp is set.
- `PUT /api/admin/helpline` (`manage_system_config`, audited as `system.helpline_update` with before and after values):
  - body `{phone, whatsapp, hours_text}`;
  - phone and WhatsApp are the society's own numbers, so they use the BD format and are stored as E.164 `+8801…`;
  - Bangla digits and `01…` / `+880…` / `880…` are accepted;
  - an empty string clears the value;
  - an invalid number returns 422 `INVALID_BD_MOBILE`;
  - `hours_text` is at most 200 characters.

## Copy (BN)

Areas: হোম · পেমেন্ট · আমার জমি · সংগঠন · আমার প্রোফাইল
Help: সাহায্য দরকার? · ফোন করুন · হোয়াটসঅ্যাপ · হেল্প ডেস্ক
Home: আমার অবস্থা · পরবর্তী ধাপ · সর্বশেষ নোটিশ · পরবর্তী অনুষ্ঠান

## Tests

- **Backend:** empty GET; PUT permission (member or finance-only admin → 403); normalisation and audit; invalid number → 422; clearing a value; cache invalidation; migration upgrade and downgrade.
- **Angular (Vitest):**
  - the shell with the flag off renders the same labels as today;
  - with the flag on, five areas, the bottom bar on a narrow viewport, and the active area highlighted;
  - **mapping guard:** the test fails if any member route in `NAV_SECTIONS` cannot be reached from an area or hub;
  - help button visibility;
  - home next-step cases;
  - language switch;
  - theme toggle shown in Profile.
- **Flutter:** shell destinations with the flag on and off, permission filtering, help button visibility, home status widget tests.
