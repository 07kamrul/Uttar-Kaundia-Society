import { Injectable, computed, signal } from '@angular/core';

/** 'bar' = non-blocking top progress bar; 'overlay' = blocking card for writes. */
export type LoaderMode = 'bar' | 'overlay';

interface ActiveCounts {
  readonly bar: number;
  readonly overlay: number;
}

/**
 * Global loading state shared by the HTTP interceptor, router hook and the
 * <app-global-loader>. Debounced so fast calls never flash a loader, and held
 * for a minimum time once shown so it never flickers.
 */
@Injectable({ providedIn: 'root' })
export class LoaderService {
  static readonly SHOW_DELAY_MS = 250;
  static readonly MIN_VISIBLE_MS = 400;
  static readonly SLOW_AFTER_MS = 8000;

  private readonly counts = signal<ActiveCounts>({ bar: 0, overlay: 0 });
  private readonly shown = signal(false);
  private readonly slow = signal(false);
  private readonly lastMode = signal<LoaderMode>('bar');

  readonly activeCount = computed(() => this.counts().bar + this.counts().overlay);
  readonly visible = this.shown.asReadonly();
  readonly isSlow = this.slow.asReadonly();
  /** Keeps the last active mode while the loader lingers for MIN_VISIBLE_MS. */
  readonly mode = computed<LoaderMode>(() => {
    const { bar, overlay } = this.counts();
    if (overlay > 0) return 'overlay';
    return bar > 0 ? 'bar' : this.lastMode();
  });

  private shownAt = 0;
  private showTimer: ReturnType<typeof setTimeout> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private slowTimer: ReturnType<typeof setTimeout> | null = null;

  /** Registers a pending task; call the returned function (safe to call twice) when it settles. */
  begin(mode: LoaderMode): () => void {
    const wasIdle = this.activeCount() === 0;
    this.counts.update((c) => ({ ...c, [mode]: c[mode] + 1 }));
    if (wasIdle) this.onBusy();

    let isEnded = false;
    return () => {
      if (isEnded) return;
      isEnded = true;
      this.lastMode.set(this.mode());
      this.counts.update((c) => ({ ...c, [mode]: Math.max(0, c[mode] - 1) }));
      if (this.activeCount() === 0) this.onIdle();
    };
  }

  private onBusy(): void {
    this.clearTimer('hideTimer');
    if (!this.shown()) {
      this.showTimer = setTimeout(() => {
        this.showTimer = null;
        this.shownAt = Date.now();
        this.shown.set(true);
      }, LoaderService.SHOW_DELAY_MS);
    }
    this.slowTimer = setTimeout(() => this.slow.set(true), LoaderService.SLOW_AFTER_MS);
  }

  private onIdle(): void {
    this.clearTimer('showTimer');
    this.clearTimer('slowTimer');
    if (!this.shown()) {
      this.slow.set(false);
      return;
    }
    const remaining = Math.max(0, LoaderService.MIN_VISIBLE_MS - (Date.now() - this.shownAt));
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      this.shown.set(false);
      this.slow.set(false);
    }, remaining);
  }

  private clearTimer(name: 'showTimer' | 'hideTimer' | 'slowTimer'): void {
    const timer = this[name];
    if (timer !== null) clearTimeout(timer);
    this[name] = null;
  }
}
