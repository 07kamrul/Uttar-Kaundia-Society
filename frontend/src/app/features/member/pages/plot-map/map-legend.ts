/** Wizard legend (map_wizard): three colours, each with a glyph and a word. */
export type LegendKind = 'approved' | 'mine' | 'pending';

export interface LegendEntry {
  kind: LegendKind;
  colour: string;
  glyph: string;
  labelKey: string;
  /** Dashed outline: a pending proposal of my own. */
  dashed: boolean;
}

const APPROVED = '#2e7d32';
const MINE = '#1e66d0';
const PENDING = '#c9861e';

const KEY = 'member.plotMap.wizard.legend.';

export const WIZARD_LEGEND: readonly LegendEntry[] = [
  { kind: 'approved', colour: APPROVED, glyph: '✔', labelKey: `${KEY}approved`, dashed: false },
  { kind: 'mine', colour: MINE, glyph: '●', labelKey: `${KEY}mine`, dashed: false },
  { kind: 'pending', colour: PENDING, glyph: '⏳', labelKey: `${KEY}pending`, dashed: false },
];

/**
 * How a shape is drawn for its review status; null = not drawn at all
 * (rejected, withdrawn and superseded shapes stay in "আমার সীমানা" with a word).
 * Disputed shapes keep their base colour; the info sheet carries the warning.
 */
export function legendEntryFor(reviewStatus: string, isMine: boolean): LegendEntry | null {
  if (reviewStatus !== 'approved' && reviewStatus !== 'pending') return null;
  const pending = reviewStatus === 'pending';
  const base = WIZARD_LEGEND.find((e) => e.kind === (isMine ? 'mine' : pending ? 'pending' : 'approved'))!;
  return { ...base, dashed: isMine && pending };
}
