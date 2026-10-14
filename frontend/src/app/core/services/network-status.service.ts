import { Injectable, computed, signal } from '@angular/core';
import { Subject } from 'rxjs';

/** An API call slower than this marks the network "slow" (contract value: 8 s). */
export const SLOW_REQUEST_MS = 8000;

const SLOW_EFFECTIVE_TYPES: ReadonlySet<string> = new Set(['slow-2g', '2g']);

/** `navigator.connection` (Network Information API) — Chromium-only, optional. */
interface NetworkInformation {
  effectiveType?: string;
  saveData?: boolean;
}

function connection(): NetworkInformation | undefined {
  try {
    return (navigator as Navigator & { connection?: NetworkInformation }).connection;
  } catch {
    return undefined;
  }
}

export type NetworkProblem = 'offline' | 'slow' | null;

/**
 * Network health for the net_status_banner (Batch 7). Offline comes from the
 * browser's online/offline events; slow comes from the connection type or from
 * any API call taking longer than `SLOW_REQUEST_MS` (see loader.interceptor).
 */
@Injectable({ providedIn: 'root' })
export class NetworkStatusService {
  private readonly online = signal(this.readOnline());
  private readonly slow = signal(this.readEffectiveType());

  /** Emits once on every real offline → online transition. */
  readonly reconnected$ = new Subject<void>();

  readonly problem = computed<NetworkProblem>(() => {
    if (!this.online()) return 'offline';
    if (this.slow()) return 'slow';
    return null;
  });

  constructor() {
    if (typeof window === 'undefined') return;
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
  }

  /**
   * Called by the loader interceptor after every API response: a slow response
   * turns the banner on, any fast response turns the slow flag back off.
   */
  noteLatency(ms: number): void {
    this.slow.set(ms > SLOW_REQUEST_MS);
  }

  private handleOnline = (): void => {
    const wasOffline = !this.online();
    this.online.set(true);
    if (wasOffline) this.reconnected$.next();
  };

  private handleOffline = (): void => {
    this.online.set(false);
  };

  private readOnline(): boolean {
    try {
      return typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
    } catch {
      return true;
    }
  }

  private readEffectiveType(): boolean {
    const type = connection()?.effectiveType;
    return typeof type === 'string' ? SLOW_EFFECTIVE_TYPES.has(type) : false;
  }
}
