import { describe, expect, it } from 'vitest';
import { outerRingLatLngs, rsLabelNumber, snapDistancePx } from './rs-labels';

describe('rs-labels', () => {
  it('uses a bigger snap distance for fingers', () => {
    expect(snapDistancePx(true)).toBeGreaterThan(snapDistancePx(false));
  });

  it('prints the dag number without the RS prefix', () => {
    expect(rsLabelNumber({ rs_plot_no: 'RS-4611' })).toBe('4611');
    expect(rsLabelNumber({ plot_no: 12 })).toBe('12');
    expect(rsLabelNumber(undefined)).toBe('');
  });

  it('turns a polygon outer ring into [lat, lng] pairs', () => {
    const ring = [[90.1, 23.1], [90.2, 23.1], [90.2, 23.2], [90.1, 23.1]];
    expect(outerRingLatLngs({ type: 'Polygon', coordinates: [ring] })?.[0]).toEqual([23.1, 90.1]);
  });

  it('takes the first polygon of a multipolygon and rejects degenerate shapes', () => {
    const ring = [[90.1, 23.1], [90.2, 23.1], [90.2, 23.2], [90.1, 23.1]];
    expect(outerRingLatLngs({ type: 'MultiPolygon', coordinates: [[ring]] })).toHaveLength(4);
    expect(outerRingLatLngs({ type: 'Polygon', coordinates: [[[1, 2]]] })).toBeNull();
    expect(outerRingLatLngs({ type: 'Point', coordinates: [] as never })).toBeNull();
    expect(outerRingLatLngs(undefined)).toBeNull();
  });
});
