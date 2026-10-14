import { describe, expect, it } from 'vitest';
import { EDIT_HISTORY_LIMIT, canRedo, canUndo, currentRing, emptyHistory, pushRing, redo, undo } from './edit-history';

const ring = (n: number): [number, number][] => [
  [n, n],
  [n + 1, n],
  [n + 1, n + 1],
];

describe('edit-history', () => {
  it('starts empty with nothing to undo or redo', () => {
    const h = emptyHistory();
    expect(currentRing(h)).toBeNull();
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
  });

  it('the first snapshot cannot be undone (nothing before it)', () => {
    const h = pushRing(emptyHistory(), ring(1));
    expect(currentRing(h)).toEqual(ring(1));
    expect(canUndo(h)).toBe(false);
  });

  it('pushes and undoes step by step', () => {
    let h = pushRing(pushRing(pushRing(emptyHistory(), ring(1)), ring(2)), ring(3));
    expect(canUndo(h)).toBe(true);
    h = undo(h);
    expect(currentRing(h)).toEqual(ring(2));
    h = undo(h);
    expect(currentRing(h)).toEqual(ring(1));
    expect(canUndo(h)).toBe(false);
    expect(currentRing(undo(h))).toEqual(ring(1));
  });

  it('redoes what was undone', () => {
    let h = pushRing(pushRing(emptyHistory(), ring(1)), ring(2));
    h = undo(h);
    expect(canRedo(h)).toBe(true);
    h = redo(h);
    expect(currentRing(h)).toEqual(ring(2));
    expect(canRedo(h)).toBe(false);
    expect(currentRing(redo(h))).toEqual(ring(2));
  });

  it('clears the redo stack on a new edit', () => {
    let h = pushRing(pushRing(pushRing(emptyHistory(), ring(1)), ring(2)), ring(3));
    h = undo(undo(h));
    h = pushRing(h, ring(9));
    expect(canRedo(h)).toBe(false);
    expect(currentRing(h)).toEqual(ring(9));
    expect(currentRing(undo(h))).toEqual(ring(1));
  });

  it('keeps at most 50 snapshots, dropping the oldest', () => {
    let h = emptyHistory();
    for (let i = 0; i < EDIT_HISTORY_LIMIT + 10; i++) h = pushRing(h, ring(i));
    let steps = 0;
    while (canUndo(h)) {
      h = undo(h);
      steps++;
    }
    expect(steps).toBe(EDIT_HISTORY_LIMIT - 1);
    expect(currentRing(h)).toEqual(ring(10));
  });

  it('does not mutate earlier states or the pushed ring', () => {
    const r = ring(1);
    const a = pushRing(emptyHistory(), r);
    const b = pushRing(a, ring(2));
    expect(currentRing(a)).toEqual(ring(1));
    expect(currentRing(b)).toEqual(ring(2));
    r[0][0] = 99;
    expect(currentRing(a)).toEqual(ring(1));
  });

  it('ignores a snapshot identical to the current one', () => {
    const a = pushRing(emptyHistory(), ring(1));
    const b = pushRing(a, ring(1));
    expect(b).toBe(a);
  });
});
