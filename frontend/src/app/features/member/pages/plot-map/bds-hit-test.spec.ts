import * as L from 'leaflet';

import { findBdsFeatureAt, isPointInPolygon } from './bds-hit-test';

const square = (x: number, y: number, dag: string) => ({
  type: 'Feature',
  properties: { dag, sheet: '1', survey: 'bds' },
  geometry: {
    type: 'Polygon',
    coordinates: [[[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]]],
  },
});

describe('bds-hit-test', () => {
  const layer = L.geoJSON({
    type: 'FeatureCollection',
    features: [square(0, 0, '101'), square(2, 0, '102')],
  } as never);

  it('returns the dag whose polygon contains the click', () => {
    expect(findBdsFeatureAt(layer, L.latLng(0.5, 2.5))?.dag).toBe('102');
    expect(findBdsFeatureAt(layer, L.latLng(0.5, 0.5))?.dag).toBe('101');
  });

  it('returns null when the click misses every dag', () => {
    expect(findBdsFeatureAt(layer, L.latLng(0.5, 1.5))).toBeNull();
  });

  it('excludes points inside a hole', () => {
    const donut = L.polygon([
      [[0, 0], [0, 4], [4, 4], [4, 0]],
      [[1, 1], [1, 3], [3, 3], [3, 1]],
    ]);
    expect(isPointInPolygon(L.latLng(2, 2), donut)).toBe(false);
    expect(isPointInPolygon(L.latLng(0.5, 0.5), donut)).toBe(true);
  });
});
