import { area, featureCollection, intersect, polygon } from '@turf/turf';
import type { PolygonGeometry } from '../../../../core/models/plot-boundary.model';
import type { LandPlotFeature } from '../../../../core/services/land-data.service';

/** Below this overlap the drawn shape is flagged as diverging from every RS dag. */
export const RS_DIVERGENCE_THRESHOLD_PCT = 60;

// 1 shatak (decimal) = 435.6 sq ft; matches the backend constant.
const SQM_PER_SHOTANGSHO = 40.4686;

export interface RsMatch {
  rsPlotNo: string;
  matchPct: number;
  diverges: boolean;
}

// Turf-free helpers live in rs-labels.ts so the map can use them without this module.
export { rsLabelNumber, snapDistancePx } from './rs-labels';

function outerRing(geometry: { type: string; coordinates: unknown }): number[][] | null {
  if (geometry.type !== 'Polygon') return null;
  const rings = geometry.coordinates as number[][][];
  return rings[0]?.length >= 4 ? rings[0] : null;
}

type Extent = [number, number, number, number]; // minLng, minLat, maxLng, maxLat

function extentOf(ring: number[][]): Extent {
  const lngs = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}

function extentsOverlap(a: Extent, b: Extent): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

/** Approximate area of an RS dag polygon in square metres and shatak. */
export function rsArea(geometry: LandPlotFeature['geometry']): { sqm: number; shotangsho: number } | null {
  const ring = outerRing(geometry);
  if (!ring) return null;
  const sqm = area(polygon([ring]));
  return { sqm, shotangsho: sqm / SQM_PER_SHOTANGSHO };
}

function overlapPct(drawnRing: number[][], rsRing: number[][]): number {
  const drawn = polygon([drawnRing]);
  const other = polygon([rsRing]);
  let overlap: ReturnType<typeof intersect>;
  try {
    overlap = intersect(featureCollection([drawn, other]));
  } catch {
    return 0; // degenerate/invalid candidate geometry: treat as no overlap
  }
  if (!overlap) return 0;
  const inter = area(overlap);
  const union = area(drawn) + area(other) - inter;
  return union > 0 ? Math.min(100, (inter / union) * 100) : 0;
}

/**
 * Intersection-over-union of the drawn shape against each RS dag polygon, as a
 * percentage. Returns the best candidate, or null when nothing overlaps.
 * Reference information for the member and committee, not an ownership claim.
 */
export function bestRsMatch(
  drawn: PolygonGeometry,
  candidates: readonly LandPlotFeature[],
): RsMatch | null {
  const drawnRing = outerRing(drawn);
  if (!drawnRing) return null;
  const drawnExtent = extentOf(drawnRing);
  let best: RsMatch | null = null;
  for (const candidate of candidates) {
    const ring = outerRing(candidate.geometry);
    const rsPlotNo = candidate.properties?.rs_plot_no;
    if (!ring || !rsPlotNo) continue;
    if (!extentsOverlap(drawnExtent, extentOf(ring))) continue; // cheap reject before turf
    const pct = Math.round(overlapPct(drawnRing, ring) * 10) / 10;
    if (pct > 0 && (!best || pct > best.matchPct)) {
      best = {
        rsPlotNo: String(rsPlotNo),
        matchPct: pct,
        diverges: pct < RS_DIVERGENCE_THRESHOLD_PCT,
      };
    }
  }
  return best;
}
