// Map tuning constants: panes, zoom thresholds, styles, storage keys.
import type * as L from 'leaflet';

export const MOVE_DEBOUNCE_MS = 300;
// Uttar Kaundia mouza (Savar) — the society's actual location. The earlier
// [23.77, 90.39] pointed at Mirpur and left the mouza data in a corner.
export const SOCIETY_CENTER: L.LatLngTuple = [23.809, 90.323];
export const DISCLAIMER_KEY = 'krmf_boundary_disclaimer_dismissed';
/** map_wizard: the member chose to load map tiles in this session. */
export const TILES_OK_KEY = 'krmf_map_tiles_ok';
export const MOUZA_CENTER: L.LatLngTuple = [23.7985, 90.3325];
export const BDS_LABEL_MIN_ZOOM = 16;

export type PlotMapMode = 'boundaries' | 'bds';

/** Pane for the RS dag reference layer: below member polygons (overlayPane = 400). */
export const RS_PANE = 'rsPane';
export const RS_PANE_Z_INDEX = '390';
/** Pane for the BDS dag layer: below RS dags and member polygons, so plot boundaries stay visible. */
export const BDS_PANE = 'bdsPane';
export const BDS_PANE_Z_INDEX = '380';
/** Pane for member plot boundaries: always above both BDS and RS dag layers. */
export const MEMBER_PANE = 'memberPane';
export const MEMBER_PANE_Z_INDEX = '420';
export const RS_LABEL_MIN_ZOOM = 16;
/** Smaller parcels stay unlabeled until zoomed in, so labels thin out at low zoom. */
export const RS_LABEL_MIN_PX = 22;
export const RS_LABEL_ALL_ZOOM = 18;
export const RS_STYLE: L.PathOptions = {
  color: '#b5530a',
  weight: 1.2,
  dashArray: '5,4',
  fillColor: '#e8a15a',
  fillOpacity: 0.06,
};
export const SNAP_CUE_COLOR = '#ff6d00';
/** Searched-dag highlight; the pulse needs a CSS class, so it is drawn on an SVG copy. */
export const SEARCH_HIT_STYLE: L.PathOptions = {
  color: '#e65100',
  weight: 4,
  fillColor: '#e65100',
  fillOpacity: 0.5,
  className: 'dag-search-hit',
};

/** Leaflet default marker/icons are unused; polygons only. */
export const STATUS_COLORS: Record<string, string> = {
  pending: '#c9861e',
  approved: '#2e7d32',
  rejected: '#8a8a8a',
  superseded: '#b0a37f',
  withdrawn: '#8a8a8a',
  disputed: '#c0392b',
};
export const MINE_COLOR = '#1e66d0';
