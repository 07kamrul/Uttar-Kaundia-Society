import { Injectable, signal } from '@angular/core';

/** localStorage key holding the user's explicit data-saver choice. */
export const DATA_SAVER_KEY = 'krmf_data_saver';

/** `navigator.connection` (Network Information API) — Chromium-only, optional. */
interface NetworkInformation {
  saveData?: boolean;
}

/**
 * "ডেটা সাশ্রয়" (Batch 7 data_saver). While the user has not chosen, the
 * browser's own Save-Data request is followed; the explicit choice wins.
 */
@Injectable({ providedIn: 'root' })
export class DataSaverService {
  private readonly state = signal(this.readStored());

  /** Reactive snapshot used by the preloading strategy and the map tile gate. */
  readonly enabled = this.state.asReadonly();

  setEnabled(value: boolean): void {
    this.state.set(value);
    try {
      localStorage.setItem(DATA_SAVER_KEY, value ? '1' : '0');
    } catch {
      // localStorage unavailable (private mode) — the choice just won't persist.
    }
  }

  private readStored(): boolean {
    try {
      const stored = localStorage.getItem(DATA_SAVER_KEY);
      if (stored === '1') return true;
      if (stored === '0') return false;
    } catch {
      // ignore
    }
    return (
      typeof navigator !== 'undefined' &&
      (navigator as Navigator & { connection?: NetworkInformation }).connection?.saveData === true
    );
  }
}
