import * as L from 'leaflet';

import type { LandPlotFeature } from '../../../../core/services/land-data.service';

type Ring = L.LatLng[];

/** Ray-casting point-in-ring test (lng = x, lat = y). */
export function isPointInRing(point: L.LatLng, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    const crosses =
      a.lat > point.lat !== b.lat > point.lat &&
      point.lng < ((b.lng - a.lng) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lng;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** Splits Leaflet's nested polygon latlngs into [outer, ...holes] groups. */
function toPolygons(latlngs: unknown): Ring[][] {
  const arr = latlngs as unknown[];
  if (!arr.length) return [];
  if (arr[0] instanceof L.LatLng) return [[arr as Ring]];
  if ((arr[0] as unknown[])[0] instanceof L.LatLng) return [arr as Ring[]];
  return arr.flatMap(toPolygons);
}

/** True when the point lies inside the polygon (outer ring, not in a hole). */
export function isPointInPolygon(point: L.LatLng, polygon: L.Polygon): boolean {
  if (!polygon.getBounds().contains(point)) return false;
  return toPolygons(polygon.getLatLngs()).some(
    ([outer, ...holes]) =>
      isPointInRing(point, outer) && !holes.some((hole) => isPointInRing(point, hole)),
  );
}

/** Properties of the BDS dag under `point`, or null when none is hit. */
export function findBdsFeatureAt(
  layer: L.GeoJSON,
  point: L.LatLng,
): LandPlotFeature['properties'] | null {
  let hit: LandPlotFeature['properties'] | null = null;
  layer.eachLayer((child) => {
    if (hit || !(child instanceof L.Polygon)) return;
    if (isPointInPolygon(point, child)) {
      hit = (child.feature as LandPlotFeature | undefined)?.properties ?? null;
    }
  });
  return hit;
}
