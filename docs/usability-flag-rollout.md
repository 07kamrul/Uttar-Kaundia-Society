# Usability Flag Rollout — Staging Runbook

Phase 1 of the user-friendliness plan. All seven simplification batches are built
(see `docs/ux-simplification-audit.md` §14) but every flag is **off by default**.
This runbook turns them on in stages on staging, so a bad flag can be switched
back without a rollback.

Flags are flipped at runtime: admin UI (feature-flag screen) or
`PUT /api/admin/feature-flags/{key}` with `{"enabled": true}`. No migration is
needed for the flips themselves — but the migrations below must be applied first,
and only by the owner (AI agents never run alembic or touch databases).

## Step 0 — Prerequisites (owner, on staging)

1. Apply the migrations from `docs/ux-simplification-audit.md` §14, in order:
   `a7c3e9b1d5f2` (flags) → `b4d6f8a0c2e5` (phones) → `c1e5a9d3b7f4`
   (registration) → `d2f6b0a4c8e1` (cost-share payments) → `e3a7c1b5d9f2`
   (settings) → `f5b8d2a6c1e7` (reject reasons) → `a8c2e4f6b1d3`
   (other-fee verification).
2. Run `python -m scripts.report_duplicate_mobiles` **before** enabling
   `login_by_phone`. If it reports duplicates, members with a shared mobile must
   log in by email or member ID (the app handles this), but note the count.

## Stage A — Accessibility + navigation (safe, visible immediately)

| Flag | Effect |
|---|---|
| `ui_a11y_v2` | Hind Siliguri only, 16–18px base, ≥48px touch targets, "লেখা বড় করুন" |
| `net_status_banner` | Offline banner |
| `data_saver` | Data-saver toggle |
| `nav_five_areas` | Member navigation collapses to five areas |
| `nav_merged_entries` | Merged entry points (R9) |

**Verify:** member login on a phone-size viewport → five bottom areas, larger
text toggle works; every old member page still reachable (mapping guard).

## Stage B — Payments + registration

| Flag | Effect |
|---|---|
| `pay_merged_page` | One merged payments page (pay a fee in 4 taps) |
| `reg_*` (8 flags, see audit §14) | Easier registration: WhatsApp field, consent version, `needs_office_help`, address/required-field relaxations |

**Verify:** timed registration run (target <5 min, ~25 non-typing taps); pay an
installment from Home (target ≤4 taps).

## Stage C — Login

| Flag | Effect |
|---|---|
| `login_by_phone` | One login field: mobile / email / member ID |
| `password_policy_v2` | Min 8 chars + common-password blocklist (also on reset page) |

**Verify:** login with `01…` and `+8801…` formats and Bangla digits; wrong
credentials show the generic message; reset page enforces the new policy.

## Stage D — Map + admin

| Flag | Effect |
|---|---|
| `map_wizard` | Guided plot-boundary wizard (skip to free-draw allowed) |
| `admin_console` | "আজকের কাজ" admin landing |
| `admin_bulk_verify` | Bulk approve with per-item results |
| `fee_wizard` | Fee-rate wizard (fixed-amount fees) |
| `nav_advanced_section` | Roadmap Mgmt, Config Lists, Asset Register, Amendments under "আরও" (R10) |

**Verify:** admin sees "আজকের কাজ" first; advanced items are under "আরও", not
gone; bulk approve returns per-item results.

## Rollback

Every flag flips back individually in the admin UI — no deploy or migration
needed. If a stage misbehaves, revert that stage's flags only.

## After rollout

Run the usability test from `docs/ux-simplification-audit.md` §11 (5 members,
including 2 older/low-tech) before building the new "সহজ মোড" (Phase 3).
