# Batch 4 — Plot map wizard: shared contract (Angular · Flutter)

Source: [`ux-simplification-audit.md`](ux-simplification-audit.md) §5, §9 ("find your plot") and §12.
**Rule:** with `map_wizard` **off**, the plot map behaves exactly as today. The boundary is still optional for registration. **No backend change**: every call below already exists.

## Today (verified in code)

| Area | Angular (`features/member/pages/plot-map/`, 1,299-line component) | Flutter (`features/plot_boundary/`) |
|---|---|---|
| Views | `mapModes` tabs boundaries / bds / rajuk, always visible; RS overlay + snap toggles in `layersPanelOpen`; Street/Satellite `L.control.layers` | `map_mode_tabs.dart` always visible |
| Legend | 5 entries (`legendItems`: approved, mine, pending, rejected, disputed) + RS swatch | `map_legend.dart`, 5 entries |
| Draw | `drawStep` `idle → pick → draw`; Geoman `enableDraw('Polygon')`; snap to RS (`snapEnabled`); only "cancel" | `boundary_editor_page.dart`: tap adds a vertex; **undo exists (icon only)**, no redo, no RS snap |
| Notice | Server text (`disclaimer_bn` from `services/plot_boundary.py`), dismissible for the session | `boundary_disclaimer_banner.dart`, `map_disclaimer.dart` |
| Tiles | OSM street tiles added in `initMap()` immediately | `TileLayer` in `plot_map_canvas.dart` and `boundary_editor_page.dart` |
| Loading | The route is lazy and `preload:false`. Geoman, turf (`rs-match.ts`, `geo.helper.ts`) and Leaflet are all imported up front. | — |

Reused endpoints:
- `GET /api/plot-map`
- `GET/POST/PUT /api/plot-boundaries[...]`
- `GET /api/land/masterplan?bbox=`
- `GET /api/land/masterplan/lookup/{rs_plot_no}` (accepts "RS-4611", "4611" and Bangla digits; approved members only)
- `GET /api/land/dag/...`

## Flag

`map_wizard` (default off). Add it to all three registries: `backend/app/core/feature_flags.py`, `FEATURE_FLAG_KEYS` in `core/services/feature-flag.service.ts`, and `FeatureFlag.mapWizard` in `mobile/lib/core/feature_flags/feature_flag.dart`, plus their key-list tests.

## Behaviour with the flag on

1. **Data-saver start:** no tile layer is added at first. The map shows member polygons and the society outline on a plain background, with a centred card: **"মানচিত্র দেখুন"** (sub-line "ইন্টারনেট ডেটা খরচ হবে"). Tapping it adds the street layer.
   - The choice is kept in `sessionStorage` (`krmf_map_tiles_ok`).
   - When the Batch 7 data-saver is on, the card is shown on every visit.
   - The tile-host preconnects move from `index.html` to the map route (see Batch 7).
2. **"আরও লেয়ার"**: one button opens a sheet with: আমার জমি (default) · সরকারি মৌজা ম্যাপ (BDS) · রাজউক RS দাগ · RS দাগ রেখা দেখান · দাগে আটকে যান (snap) · স্যাটেলাইট.
   - The mode tabs and `L.control.layers` are not rendered.
   - The existing `layer-prefs.ts` persistence is kept.
3. **Legend with 3 colours + words**, each with an icon:
   - ✔ অনুমোদিত `#2e7d32`;
   - ● আমার `#1e66d0` (solid when approved, dashed when pending);
   - ⏳ অপেক্ষায় `#c9861e`.
   - Rejected, withdrawn and superseded shapes are **not drawn**; they stay in "আমার সীমানা" with a status word.
   - Disputed shapes keep their base colour, and the info sheet shows "⚠ বিরোধ চলছে" (B4-O1).
4. **Three-step wizard** with the header "ধাপ ১ / ৩ — দাগ খুঁজুন":
   - **১. দাগ খুঁজুন** — pick the property (from `availableProperties`). Its `dagNoRs` is filled in, then `lookupRsPlot()` runs.
     - Candidates are highlighted, and the map zooms to fit them.
     - Buttons: "এটাই আমার দাগ" / "অন্য দাগ খুঁজুন" / "দাগ পাওয়া যায়নি — নিজে আঁকুন".
     - A property flagged `needs_office_help` with no dag skips straight to free drawing.
   - **২. সীমানা ঠিক করুন** — default **"দাগ থেকে শুরু করুন"**: the chosen RS polygon is copied as an editable shape, with snap on. The alternative is "নিজে আঁকুন" (today's `enableDraw`).
     - **Undo/redo with text**: "↶ এক ধাপ পেছনে" / "↷ আবার করুন", each at least 48 px.
     - Also "সব মুছে নতুন করে" and a live area figure next to the declared land amount, using the existing `validation()` warnings.
   - **৩. জমা দিন** — a plain summary: property, dag, area, the match with the RS dag (`rsMatch`), the short notice, then "জমা দিন" (existing `create`/`update`, and the pending-replace confirm).
5. **Undo/redo model:** a new pure `edit-history.ts`.
   - Snapshots are rings, up to 50.
   - A snapshot is pushed on `pm:edit`, `pm:vertexadded`, `pm:vertexremoved`, and when a polygon is pre-filled from the RS dag.
   - Undo/redo call `setLatLngs` and re-enable `pm`.
   - During freehand drawing (before the polygon closes), undo means "remove last vertex" (Geoman `_removeLastVertex`) and redo is disabled.
6. **First-time tour:** 4 coach marks: layers button → legend → "সীমানা আঁকুন" → help "?".
   - Stored in `localStorage` `krmf_map_tour_v1` (Flutter: `AppPreferences.mapTourDone`).
   - "আবার দেখুন" is in the map's "?" menu.
   - It can be skipped, closes with Esc, and moves focus to each mark.
7. **Short notice:** "এটি আনুমানিক সীমানা — সরকারি জরিপ বা দলিলের বিকল্প নয়।" The "বিস্তারিত" link shows the server `disclaimer_bn` unchanged.
8. **Lazy loading inside the map chunk:**
   - `shared/map/leaflet-geoman-setup` is loaded with `import()` only when step 2 starts. The admin `plot-boundaries` page keeps its static import, so the chunk is shared.
   - `rs-match.ts` (turf) is loaded with `import()` when the match is first computed.
   - BDS/RS GeoJSON is fetched only when that layer is switched on, or in steps 1–2.

## Angular files

- `plot-map.component.ts/.html/.scss`: add `wizardOn = computed(() => flags.isEnabled('map_wizard'))`, plus the tile gate, layers sheet, legend v2, step header and history wiring. The old template blocks stay for flag off.
- New in `plot-map/`: `edit-history.ts` (+spec), `map-legend.ts` (status → `{colour, icon, labelKey}` or null; +spec), `map-tour/` (standalone component), `layers-sheet/` (standalone component).
- i18n `public/i18n/bn.json` / `en.json` under `member.plotMap.wizard.*`.

## Flutter files

- `widgets/map/plot_map_canvas.dart`: the tile gate (state in `PlotMapBloc`: `tilesRequested`).
- `widgets/map/map_mode_tabs.dart`: replaced by `layers_sheet.dart` when the flag is on.
- `widgets/map/map_legend.dart`: three items.
- `bloc/boundary_editor_*`: add `redoStack`, `EditorRedoPressed`, `EditorPrefilledFromDag(List<LatLng>)`, `step` (find / adjust / submit). Undo clears nothing; any new edit clears `redoStack`.
- `pages/boundary_editor_page.dart`: the step header, labelled `TextButton.icon` undo/redo, and "দাগ থেকে শুরু করুন" via `LandDataRepository.lookup(LandLayer.rajuk, dag)`.
- New: `widgets/map_tour_overlay.dart`, `widgets/short_disclaimer.dart`.
- `l10n/app_bn.arb` / `app_en.arb`.

## Copy (BN)

- Buttons and labels: আরও লেয়ার · মানচিত্র দেখুন · দাগ খুঁজুন · সীমানা ঠিক করুন · জমা দিন · দাগ থেকে শুরু করুন · নিজে আঁকুন · এক ধাপ পেছনে · আবার করুন · এটাই আমার দাগ · দাগ পাওয়া যায়নি — নিজে আঁকুন
- Legend: অনুমোদিত · আমার · অপেক্ষায়

## Tests

**Angular (Vitest):**
- `edit-history` push/undo/redo/cap/redo-cleared-on-new-edit;
- `map-legend` mapping (rejected → null);
- plot-map with the flag off: today's DOM (mode tabs, 5-item legend, tiles added on init);
- with the flag on:
  - no `L.TileLayer` until "মানচিত্র দেখুন", and the session flag is respected;
  - the layers sheet switches modes;
  - step flow pick → RS lookup → prefill → submit calls `create` with the edited ring;
  - "not found" → free draw;
  - undo/redo buttons are disabled correctly and have text labels;
  - the tour shows once;
  - the short notice expands to the server text;
- the Geoman dynamic import is awaited before draw (mock the `import`).

**Flutter:** editor bloc redo/prefill tests (`bloc_test`), the editor page step header and labelled buttons, the canvas with no `TileLayer` until tapped, the legend with 3 items, the tour once, and flag off unchanged (extend `plot_map_page_test.dart`, `boundary_editor_bloc_test.dart`).

**Measure:** taps for "find your plot and submit" with a known RS dag. The target is ≤ 6: আমার জমি → প্লট ম্যাপ → সীমানা আঁকুন → এটাই আমার দাগ → পরবর্তী → জমা দিন. Also record map-chunk transfer before and after with tiles gated (DevTools, Slow 4G).

## Risks

- Several RS plots can share a number. The member must pick one; show every candidate with its sheet label.
- RS polygons are reference data. A pre-filled shape can carry RS errors, so step 3 keeps the existing area warnings.
- Geoman has no redo. The custom history must re-enable editing after `setLatLngs`, or the vertex handles disappear.
- Without tiles, some members may not recognise the area. The card copy must make tapping obvious.

## Open decisions (owner)

- **B4-O1:** Disputed shapes: base colour + sheet label (proposed), or a fourth red legend entry?
- **B4-O2:** Remember "মানচিত্র দেখুন" per session (proposed) or permanently, when the data-saver is off?
- **B4-O3:** Should step 1 be skippable for members whose property has no RS dag but who know the location?

**Adopted for implementation (owner may override):** every open decision above takes its *proposed* option.
