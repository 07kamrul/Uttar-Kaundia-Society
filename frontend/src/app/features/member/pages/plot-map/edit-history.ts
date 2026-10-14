/** A polygon ring as Leaflet [lat, lng] pairs. */
export type Ring = ReadonlyArray<readonly [number, number]>;

/** Undo depth for the boundary editor (Geoman has no undo/redo of its own). */
export const EDIT_HISTORY_LIMIT = 50;

/** Immutable snapshot list plus a cursor; undo/redo only move the cursor. */
export interface EditHistory {
  readonly snapshots: readonly Ring[];
  readonly index: number;
}

export function emptyHistory(): EditHistory {
  return { snapshots: [], index: -1 };
}

const copyRing = (ring: Ring): Ring => ring.map(([lat, lng]) => [lat, lng] as const);

function sameRing(a: Ring, b: Ring): boolean {
  return a.length === b.length && a.every((p, i) => p[0] === b[i][0] && p[1] === b[i][1]);
}

export function currentRing(history: EditHistory): Ring | null {
  return history.snapshots[history.index] ?? null;
}

export function canUndo(history: EditHistory): boolean {
  return history.index > 0;
}

export function canRedo(history: EditHistory): boolean {
  return history.index >= 0 && history.index < history.snapshots.length - 1;
}

/** Records a new snapshot; a new edit discards anything that could have been redone. */
export function pushRing(history: EditHistory, ring: Ring): EditHistory {
  const current = currentRing(history);
  if (current && sameRing(current, ring)) return history;
  const kept = [...history.snapshots.slice(0, history.index + 1), copyRing(ring)];
  const snapshots = kept.slice(-EDIT_HISTORY_LIMIT);
  return { snapshots, index: snapshots.length - 1 };
}

export function undo(history: EditHistory): EditHistory {
  return canUndo(history) ? { ...history, index: history.index - 1 } : history;
}

export function redo(history: EditHistory): EditHistory {
  return canRedo(history) ? { ...history, index: history.index + 1 } : history;
}
