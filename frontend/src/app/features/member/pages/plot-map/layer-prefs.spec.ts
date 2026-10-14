import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LAYER_PREFS_KEY, hasStoredLayerPrefs, readLayerPrefs, writeLayerPrefs } from './layer-prefs';

/** Minimal in-memory Storage; the test runtime's localStorage is not reliable. */
function memoryStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

describe('layer prefs', () => {
  beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('defaults to RS overlay on and snapping on', () => {
    expect(readLayerPrefs()).toEqual({ rsOverlay: true, snapToRs: true });
  });

  it('knows whether the member ever saved a preference', () => {
    expect(hasStoredLayerPrefs()).toBe(false);
    writeLayerPrefs({ rsOverlay: true, snapToRs: true });
    expect(hasStoredLayerPrefs()).toBe(true);
  });

  it('round-trips saved preferences', () => {
    writeLayerPrefs({ rsOverlay: false, snapToRs: false });
    expect(readLayerPrefs()).toEqual({ rsOverlay: false, snapToRs: false });
  });

  it('falls back to defaults for corrupt storage', () => {
    localStorage.setItem(LAYER_PREFS_KEY, '{not json');
    expect(readLayerPrefs()).toEqual({ rsOverlay: true, snapToRs: true });
  });

  it('ignores non-boolean fields', () => {
    localStorage.setItem(LAYER_PREFS_KEY, JSON.stringify({ rsOverlay: 'no', snapToRs: false }));
    expect(readLayerPrefs()).toEqual({ rsOverlay: true, snapToRs: false });
  });

  it('survives storage that throws (private mode)', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    });
    expect(readLayerPrefs()).toEqual({ rsOverlay: true, snapToRs: true });
    expect(() => writeLayerPrefs({ rsOverlay: false, snapToRs: false })).not.toThrow();
  });
});
