# Batch 7 — Performance and accessibility: shared contract (Angular · Flutter)

Source: [`ux-simplification-audit.md`](ux-simplification-audit.md) §9 (first useful screen < 3 s on Slow 4G) and §12 item 7.
**Rule:** build-level performance work (fonts, CSS split, lazy QR, preconnects) changes **no behaviour** and ships unflagged after a measured before/after. The one visible change, the typeface, is owner decision B7-O1. Every user-visible UX change is behind a flag (off = unchanged). **No new npm or pub dependencies**; anything that needs one is listed for approval.

## Baseline (measured from `frontend/dist`, 2026-10-13 build)

| Item | Now | Source |
|---|---|---|
| Initial total | **520.38 kB**: main 126.3 + polyfills 35.7 + styles 109.4 + framework chunk 247.6 + about 1.3 small | `angular.json` budget `initial` warns at 500 kB |
| Leaflet + Geoman CSS in global `styles.scss` | 14.8 + 25.6 kB unminified | `@use 'leaflet/dist/leaflet.css'`, `@use '@geoman-io/.../leaflet-geoman.css'` |
| QR library | 68.7 kB inside the **shell** chunk (loaded on every signed-in page) | `shell.component.ts` imports `IdCardModalComponent` → `import QRCode from 'qrcode'` |
| Fonts | 4 families from Google Fonts: Inter ×4, Tiro Bangla, Hind Siliguri ×4, Noto Sans Bengali ×4 | `src/index.html`; 32 `font-family` uses in 9 files |
| Preconnects on every page | 4 tile hosts (a/b/c OSM, arcgis) | `src/index.html` |
| Base font | browser default 16 px; 319 sub-16 px declarations (`0.5–0.88rem`, `10–13px`) | scss |
| Flutter fonts | `Inter` / `Tiro Bangla` named in `app_theme.dart`, **not bundled** → silent system fallback | `pubspec.yaml` has no `fonts:` |

## Build-level items (unflagged)

1. **Fonts:** one family, **Hind Siliguri** (400, 600, 700), `font-display: swap`.
   - Replace every `font-family` with `var(--font-body)` / `var(--font-heading)`, both `'Hind Siliguri', system-ui, sans-serif`. Headings use weight 600/700.
   - Remove Inter, Tiro Bangla and Noto Sans Bengali.
   - Subsetting has two options (B7-O1):
     - (a) Google css2 URL limited to `family=Hind+Siliguri:wght@400;600;700&display=swap`, which is already served with `unicode-range` bengali/latin subsets;
     - (b) **proposed:** self-host the bengali + latin woff2 subsets (OFL, committed under `public/fonts/`, not a package), with `@font-face` + `<link rel="preload">` for 400-bengali. This removes 2 third-party connections.
2. **Leaflet CSS only on map routes:**
   - move both `@use` lines to `src/styles/map.scss`;
   - in `angular.json` styles, add `{"input":"src/styles/map.scss","bundleName":"map","inject":false}`;
   - a new `shared/map/load-map-styles.ts` appends `<link href="map.css">` once (Promise) and is awaited in `plot-map` and `plot-boundaries` before `L.map()`.
   - Expected initial ≈ 482 kB, **to be verified**.
3. **QR out of the shell:** in `id-card-modal.component.ts`, `const { default: QRCode } = await import('qrcode')` when rendering, or wrap the shell's `<app-id-card-modal>` in `@defer (when isIdCardOpen())`.
4. **Preconnects:** remove the 4 tile-host preconnects from `index.html`; `load-map-styles.ts` adds them on map routes.
5. **Budget:** after the items above, the initial bundle must be < 500 kB. Proposal (B7-O2): lower `maximumError` from 1 MB to 550 kB to lock the gain in.

## Flags

| Key | Covers |
|---|---|
| `ui_a11y_v2` | Base text 16 px minimum for body copy (meta ≥ 14 px); **"লেখা বড় করুন"** setting; ≥ 48 px targets; icons always with text; plain confirm dialogs; "?" help per registration step |
| `data_saver` | "ডেটা সাশ্রয়" setting and its effects |
| `net_status_banner` | Offline / slow-network banner |

## Angular

- **`ui_a11y_v2`** adds `html.ui-v2` (set in `app.ts` from the flag).
  - Global rules in `styles.scss`, scoped to `.ui-v2`:
    - `button, .btn, a.nav-link, .chip, label:has(input[type=checkbox|radio])` get `min-height: 48px` and `min-width: 48px`;
    - the small-font classes are raised.
  - **"লেখা বড় করুন"** is a switch in Profile › "প্রদর্শন" (next to the theme toggle from Batch 3). It is stored in `localStorage` `krmf_text_size`, and adds `html.text-lg { font-size: 112.5% }` (18 px). Rem-based sizes scale; px-based ones in member pages are converted to rem.
  - **Icons with text:** icon-only buttons in member pages show visible text. The inventory is a grep of `<button` containing only `<app-icon>`; the shell bottom bar already has labels.
  - **Plain confirms:**
    - replace the one `window.confirm` (`property-list.component.ts`) with `app-confirm-modal`;
    - copy rule for all 17 confirm-modal uses: title is a question, one sentence of consequence, buttons "হ্যাঁ, …করুন" / "না, ফিরে যান".
  - **Registration "?" help:** new `shared/help-tip` (48 px "?" → sheet with 2–3 lines + optional sample image), keys `registration.help.step1…step6`. It reuses Batch 1's dag help sheet for step 2.
- **`data_saver`:** new `core/services/data-saver.service.ts`. A signal stored in `localStorage` `krmf_data_saver`; when unset it follows `navigator.connection?.saveData`. Effects:
  - `SelectivePreloadingStrategy` preloads nothing;
  - the map tile gate (Batch 4) asks on every visit and satellite is hidden;
  - notice/event images become a "ছবি দেখুন" tap-to-load placeholder.
  - The switch is in Profile › "প্রদর্শন".
- **`net_status_banner`:** new `core/services/network-status.service.ts`.
  - `online` from `navigator.onLine` + `online`/`offline` events;
  - `slow` when `navigator.connection.effectiveType` is `slow-2g`/`2g`, or any API call takes more than 8 s (timed in `loader.interceptor.ts`);
  - `lastNetworkError` when status is 0;
  - `reconnected$`.
  - New `shared/net-status-banner` (`role="status"`, `aria-live="polite"`) in the shell and public shell:
    - "ইন্টারনেট সংযোগ নেই — সংযোগ ফিরলে আবার চেষ্টা করুন";
    - "ইন্টারনেট ধীর — একটু অপেক্ষা করুন";
    - "আবার সংযুক্ত" for 3 s.
- **Skeleton + retry audit (unflagged fix, behaviour-neutral):**
  - Every page-level fetch must have a skeleton (`app-section-loader`, 48 uses today) **and** an error state: message from `toUserMessageKey` + "আবার চেষ্টা করুন". The error state is a new `shared/load-error` component.
  - Order: home, payments, my-land, organisation, notices, events, profile, plot map; then admin.
  - Inventory: grep `.subscribe(` without `error:` in `features/**`. The table goes in the PR description.

## Flutter

- **Fonts (B7-O1):** either bundle Hind Siliguri 400/600/700 TTF under `assets/fonts/` + a `fonts:` entry (about +1.2 MB APK), or drop `Inter`/`Tiro Bangla` and use the system Noto Sans Bengali (0 bytes). Proposed: system font.
- **`ui_a11y_v2`:**
  - `AppPreferences.textScale` (1.0 / 1.15), applied in `MaterialApp.builder` via `MediaQuery.withClampedTextScaling` (respects the system setting, max 1.3);
  - theme: `materialTapTargetSize: padded`, buttons `minimumSize: Size(48,48)`, body text 16;
  - `NavigationBar` `labelBehavior: alwaysShow`;
  - shared `showPlainConfirm()`;
  - "?" help on the registration steps.
- **`data_saver`:** `AppPreferences.dataSaver`; map tile gate and image tap-to-load.
- **`net_status_banner`:** a `NetworkStatusCubit` fed by an interceptor in `core/network/api_client.dart`.
  - `DioExceptionType.connectionError`/`connectionTimeout` → offline;
  - success → online;
  - more than 8 s → slow.
  - A banner in `features/settings/shell_page.dart`.
  - `connectivity_plus` would be a new dependency and needs approval; it is not required.

## How to measure (before/after, attached to the PR)

1. **Bundle:**
   - `npx ng build --configuration production` → the "Initial total" line (target < 500 kB) and per-chunk sizes;
   - `npx ng build --configuration production --stats-json` → open `dist/frontend/stats.json` in the esbuild analyzer web page (no install) and confirm `qrcode` is not in the shell chunk and Leaflet CSS is only in `map.css`.
2. **Network:** Chrome DevTools, Slow 4G, cache disabled, 360×800, on `/login`, `/dashboard`, `/register`, `/plot-map`. Record:
   - font requests and KB;
   - total transferred KB;
   - time to first contentful screen;
   - connections opened.
3. **Lighthouse:** the DevTools Lighthouse panel (mobile, simulated throttling): Performance, LCP, TBT, CLS, Accessibility (incl. tap targets and contrast). The Lighthouse CLI (`npx lighthouse`) would download a package, so it **needs approval** and is optional.
4. **Flutter:**
   - `flutter build apk --analyze-size --target-platform android-arm64` (APK size if fonts are bundled);
   - widget tests with `meetsGuideline(androidTapTargetGuideline)`, `labeledTapTargetGuideline` and `textContrastGuideline` on the shell, home, payments, login and registration step 1.

## Tests

**Angular (Vitest):**
- `html.ui-v2` / `text-lg` classes toggled by the flag and setting;
- the text-size and data-saver settings persist;
- the preloading strategy returns nothing with data-saver on;
- `NetworkStatusService` offline/online/slow transitions (fake timers) and the banner text;
- `load-map-styles` injects the link once;
- id-card modal awaits the dynamic QR import;
- `help-tip` opens and closes with focus return;
- no icon-only buttons in member pages with the flag on (DOM query);
- `load-error` retry re-calls the loader.

jsdom cannot measure layout, so 48 px targets are checked by Lighthouse and Flutter guidelines, not Vitest.

**Flutter:** guideline tests above; text-scale clamp; data-saver tile gate; network cubit + banner; plain confirm.

## Risks

- Changing the typeface alters line heights and can break tight layouts (cards, the ID card PDF/print). Screenshot-compare the key pages on staging.
- Raising sizes to 48 px and 18 px can overflow fixed-width admin tables. Scope `ui-v2` to member pages first if needed.
- `navigator.connection` is missing in Safari/Firefox; fall back to request timing.
- Self-hosted fonts must be served with long cache headers (`serve.json` / nginx).

## Open decisions (owner)

- **B7-O1:** Hind Siliguri only, self-hosted (proposed) or Google-hosted? In Flutter, use the system font (proposed) or bundle it?
- **B7-O2:** Tighten the `maximumError` budget to 550 kB?
- **B7-O3:** "লেখা বড় করুন" as one step (18 px, proposed) or two steps (17/19 px)?
- **B7-O4:** Approve `connectivity_plus` / Lighthouse CLI, or keep zero new dependencies (proposed)?

**Adopted for implementation (owner may override):** B7-O1 → option (a): Google-hosted Hind Siliguri only (400/600/700, `display=swap`); no font files are downloaded into the repo. Flutter uses the system font. B7-O2 → `maximumError` 550 kB. B7-O3 → one step (18 px). B7-O4 → zero new dependencies.
