import { describe, expect, it } from 'vitest';
import { WIZARD_LEGEND, legendEntryFor } from './map-legend';

describe('map-legend', () => {
  it('has three entries: approved, mine, pending', () => {
    expect(WIZARD_LEGEND.map((e) => e.kind)).toEqual(['approved', 'mine', 'pending']);
    expect(WIZARD_LEGEND.map((e) => e.colour)).toEqual(['#2e7d32', '#1e66d0', '#c9861e']);
    for (const e of WIZARD_LEGEND) {
      expect(e.glyph.length).toBeGreaterThan(0);
      expect(e.labelKey).toMatch(/^member\.plotMap\.wizard\.legend\./);
    }
  });

  it('maps an approved shape of someone else to green', () => {
    expect(legendEntryFor('approved', false)).toMatchObject({ colour: '#2e7d32', dashed: false });
  });

  it('maps my approved shape to solid blue and my pending one to dashed blue', () => {
    expect(legendEntryFor('approved', true)).toMatchObject({ colour: '#1e66d0', dashed: false });
    expect(legendEntryFor('pending', true)).toMatchObject({ colour: '#1e66d0', dashed: true });
  });

  it('maps someone elses pending shape to amber', () => {
    expect(legendEntryFor('pending', false)).toMatchObject({ colour: '#c9861e', dashed: false });
  });

  it.each(['rejected', 'withdrawn', 'superseded', 'deleted', 'unknown'])('does not draw a %s shape', (status) => {
    expect(legendEntryFor(status, true)).toBeNull();
    expect(legendEntryFor(status, false)).toBeNull();
  });
});
