import type { LandPlotFeature } from '../../../../core/services/land-data.service';

/**
 * Small RS-plot helpers that need no geometry library. Kept apart from
 * rs-match.ts (turf) so the map can load that module on demand.
 */

const SNAP_DISTANCE_MOUSE_PX = 12;
const SNAP_DISTANCE_TOUCH_PX = 24;

/** Snap tolerance in pixels; fingers need a larger target than a mouse. */
export function snapDistancePx(isTouch: boolean): number {
  return isTouch ? SNAP_DISTANCE_TOUCH_PX : SNAP_DISTANCE_MOUSE_PX;
}

/** Dag number as printed on the map ("RS-4611" -> "4611"). */
export function rsLabelNumber(props: LandPlotFeature['properties'] | undefined): string {
  const raw = props?.rs_plot_no ?? props?.plot_no;
  if (raw === undefined || raw === null) return '';
  return String(raw).replace(/^RS-?/i, '');
}

/** Outer ring of an RS plot as Leaflet [lat, lng] pairs; null when it has no usable polygon. */
export function outerRingLatLngs(geometry: LandPlotFeature['geometry'] | undefined): Array<[number, number]> | null {
  if (!geometry) return null;
  const coordinates = geometry.coordinates as unknown;
  let ring: unknown;
  if (geometry.type === 'Polygon') ring = (coordinates as number[][][])[0];
  else if (geometry.type === 'MultiPolygon') ring = (coordinates as number[][][][])[0]?.[0];
  if (!Array.isArray(ring) || ring.length < 4) return null;
  return (ring as number[][]).map((pair) => [pair[1], pair[0]] as [number, number]);
}
