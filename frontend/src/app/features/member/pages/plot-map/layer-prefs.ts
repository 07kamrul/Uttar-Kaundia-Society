/** Per-browser map layer preferences (which reference layers are on). */
export interface LayerPrefs {
  rsOverlay: boolean;
  snapToRs: boolean;
}

export const LAYER_PREFS_KEY = 'krmf_plot_map_layers';

const DEFAULT_PREFS: LayerPrefs = { rsOverlay: true, snapToRs: true };

export function readLayerPrefs(): LayerPrefs {
  try {
    const raw = localStorage.getItem(LAYER_PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<Record<keyof LayerPrefs, unknown>>;
    return {
      rsOverlay: typeof parsed.rsOverlay === 'boolean' ? parsed.rsOverlay : DEFAULT_PREFS.rsOverlay,
      snapToRs: typeof parsed.snapToRs === 'boolean' ? parsed.snapToRs : DEFAULT_PREFS.snapToRs,
    };
  } catch {
    return DEFAULT_PREFS; // unavailable or corrupt storage: keep defaults
  }
}

/** True once the member has saved a choice (the defaults then no longer apply). */
export function hasStoredLayerPrefs(): boolean {
  try {
    return localStorage.getItem(LAYER_PREFS_KEY) !== null;
  } catch {
    return false;
  }
}

export function writeLayerPrefs(prefs: LayerPrefs): void {
  try {
    localStorage.setItem(LAYER_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // private mode / quota: preference just won't persist
  }
}
