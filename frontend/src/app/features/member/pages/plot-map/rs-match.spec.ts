import { describe, expect, it } from 'vitest';
import type { PolygonGeometry } from '../../../../core/models/plot-boundary.model';
import type { LandPlotFeature } from '../../../../core/services/land-data.service';
import {
  RS_DIVERGENCE_THRESHOLD_PCT,
  bestRsMatch,
  rsLabelNumber,
  snapDistancePx,
} from './rs-match';

function square(lng: number, lat: number, size = 0.0004): PolygonGeometry {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [lng, lat],
        [lng + size, lat],
        [lng + size, lat + size],
        [lng, lat + size],
        [lng, lat],
      ],
    ],
  };
}

function rs(rsPlotNo: string, geometry: PolygonGeometry): LandPlotFeature {
  return {
    type: 'Feature',
    properties: { rs_plot_no: rsPlotNo },
    geometry: geometry as LandPlotFeature['geometry'],
  };
}

describe('bestRsMatch', () => {
  it('reports ~100% for an identical shape', () => {
    const drawn = square(90.3366, 23.8012);
    const match = bestRsMatch(drawn, [rs('RS-1', drawn)]);
    expect(match?.rsPlotNo).toBe('RS-1');
    expect(match?.matchPct).toBeGreaterThanOrEqual(99);
    expect(match?.diverges).toBe(false);
  });

  it('scores a half-shifted shape well below the divergence threshold', () => {
    const drawn = square(90.3366, 23.8012);
    const match = bestRsMatch(drawn, [rs('RS-2', square(90.3368, 23.8012))]);
    expect(match).not.toBeNull();
    expect(match!.matchPct).toBeGreaterThan(20);
    expect(match!.matchPct).toBeLessThan(RS_DIVERGENCE_THRESHOLD_PCT);
    expect(match!.diverges).toBe(true);
  });

  it('picks the best of several candidates', () => {
    const drawn = square(90.3366, 23.8012);
    const match = bestRsMatch(drawn, [rs('RS-FAR', square(90.3366, 23.81)), rs('RS-NEAR', drawn)]);
    expect(match?.rsPlotNo).toBe('RS-NEAR');
  });

  it('returns null when nothing overlaps', () => {
    const drawn = square(90.3366, 23.8012);
    expect(bestRsMatch(drawn, [rs('RS-FAR', square(90.4, 23.9))])).toBeNull();
  });

  it('returns null for an empty candidate list', () => {
    expect(bestRsMatch(square(90.3366, 23.8012), [])).toBeNull();
  });
});

describe('rsLabelNumber', () => {
  it('strips the RS- prefix', () => {
    expect(rsLabelNumber({ rs_plot_no: 'RS-4611' })).toBe('4611');
  });

  it('falls back to plot_no and then empty', () => {
    expect(rsLabelNumber({ plot_no: 77 })).toBe('77');
    expect(rsLabelNumber({})).toBe('');
  });
});

describe('snapDistancePx', () => {
  it('uses a larger tolerance on touch devices', () => {
    expect(snapDistancePx(true)).toBeGreaterThan(snapDistancePx(false));
  });
});
