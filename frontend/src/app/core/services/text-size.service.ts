import { Injectable, signal } from '@angular/core';

/** localStorage key holding the user's text-size choice ('lg' or ''). */
export const TEXT_SIZE_KEY = 'krmf_text_size';

/**
 * "লেখা বড় করুন" (Batch 7 ui_a11y_v2). One step: large adds `html.text-lg`,
 * which raises the base font size to 112.5% (18 px) so every rem-based size
 * scales up.
 */
@Injectable({ providedIn: 'root' })
export class TextSizeService {
  private readonly state = signal(this.readStored());

  readonly large = this.state.asReadonly();

  constructor() {
    this.apply();
  }

  toggle(): void {
    this.state.update((large) => !large);
    try {
      localStorage.setItem(TEXT_SIZE_KEY, this.state() ? 'lg' : '0');
    } catch {
      // localStorage unavailable (private mode) — the choice just won't persist.
    }
    this.apply();
  }

  private apply(): void {
    document.documentElement.classList.toggle('text-lg', this.state());
  }

  private readStored(): boolean {
    try {
      return localStorage.getItem(TEXT_SIZE_KEY) === 'lg';
    } catch {
      return false;
    }
  }
}
