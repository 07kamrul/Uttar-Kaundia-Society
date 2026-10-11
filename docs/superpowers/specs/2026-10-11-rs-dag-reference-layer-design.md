# RS দাগ reference layer on the Plot Boundary Map — design

Date: 2026-10-11 · Status: approved by product owner (scope below)

## Decisions

- **Data source:** the RAJUK masterplan overlay already ingested at
  `backend/data/uttar-kaundia/masterplan.geojson` (2,470 Polygons; properties
  `plot_no`, `rs_plot_no` e.g. `RS-4611`). It *is* the RS dag dataset. No
  khatian/mouza/area attributes exist: mouza comes from `meta.json`, area is
  computed with Turf.
- **No PostGIS, no vector tiles.** Dataset is 2.2 MB; the existing
  bbox-filtered endpoint (`masterplanInBbox`) is sufficient. Geometry stays
  GeoJSON, consistent with `models/plot_boundary.py`.
- **Out of scope:** admin GeoJSON upload tool (data is loaded by
  `scripts/ingest_land_data`), Flutter mobile app, PostGIS.

## Frontend (`features/member/pages/plot-map`)

1. **RS overlay, not a mode.** `PlotMapMode` keeps `boundaries | bds`; the
   RAJUK/RS layer becomes an independent boolean overlay (default ON),
   rendered beneath member boundaries, dashed orange thin outline. Layer
   toggle state persisted in localStorage.
2. **Labels:** dag number labels from zoom >= 16 (existing `BDS_LABEL_MIN_ZOOM`
   pattern); hidden below to avoid clutter.
3. **Popup:** dag no, mouza, computed approx. area, "reference only — not an
   ownership claim".
4. **Search:** the RS search works in every mode; selecting a result flies to
   the parcel, highlights it (distinct fill) with a temporary pulse class.
5. **Snapping:** Geoman `snappable` + `snapDistance`, targeting the RS layer.
   "Snap to RS dag" toggle, default ON. Tolerance 12 px mouse / 24 px touch.
   Geoman's snap marker is the visual cue.
6. **Match summary:** after drawing, Turf intersects the polygon with RS
   polygons in its bbox; best match shown as
   "আপনার আঁকা সীমানা RS দাগ XXX এর সাথে N% মিলে যাচ্ছে". Below 60% best
   overlap (or no overlap) show a divergence warning. Pure function in its own
   file with unit tests.
7. **Mobile (<768 px):** layer switcher and legend collapse into one
   expandable panel.

## Backend

- Alembic migration: add `rs_plot_no` (nullable str, indexed) and
  `rs_match_pct` (nullable numeric) to `plot_boundary_versions`; mirrored on
  `plot_boundaries` like other review fields.
- Match is **recomputed server-side at submit** over the `LandDataProvider`
  masterplan features; the client value is not trusted. Stored with the
  version and surfaced in the admin review schemas.
- Admin review map (`management/pages/plot-boundaries`) shows the RS overlay
  under the drawn boundary by default and displays the stored RS dag + match %.

## Testing

- Unit: match-percentage function (full overlap, partial, none, multi-RS),
  server-side match service, migration upgrade/downgrade.
- Component: overlay default-on + persistence, search highlight, snap toggle
  defaults, mobile collapse.

## Risks

- RS dag polygons are RAJUK DAP overlay geometry, accuracy unverified; UI copy
  must say "reference only".
- Server-side geometry needs a geometry lib; check whether `shapely` is
  already a backend dependency (`services/geo.py`) before adding one.
