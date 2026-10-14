import { InjectionToken, inject, Injectable } from '@angular/core';
import type { Route } from '@angular/router';
import { PreloadingStrategy } from '@angular/router';
import { Observable, defer, finalize, of, switchMap } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { DataSaverService } from '../services/data-saver.service';

/** Emits once the browser is idle; overridable so tests don't wait on real idle time. */
export const PRELOAD_IDLE = new InjectionToken<Observable<void>>('PRELOAD_IDLE', {
  providedIn: 'root',
  factory: () =>
    new Observable<void>((subscriber) => {
      const done = () => {
        subscriber.next();
        subscriber.complete();
      };
      if (typeof requestIdleCallback === 'function') {
        const id = requestIdleCallback(done, { timeout: 4000 });
        return () => cancelIdleCallback(id);
      }
      const id = setTimeout(done, 1500);
      return () => clearTimeout(id);
    }),
});

/** Chunks fetched in parallel; keeps preloading from competing with the page's own API calls. */
export const MAX_CONCURRENT_PRELOADS = 2;

/**
 * Preloads lazy route chunks in the background once the browser is idle, a
 * couple at a time, so navigation doesn't stall on a network round-trip
 * without slowing the page the user is actually looking at.
 *
 * Routes opt out with `data: { requiredPermissions: string[] }`; those are
 * only fetched when the signed-in user actually holds one of the listed
 * permission keys, so e.g. a member's browser doesn't download the
 * submissions/RBAC code it can never reach. Heavy chunks (the Leaflet map)
 * set `data: { preload: false }` and load only when first visited.
 */
@Injectable({ providedIn: 'root' })
export class SelectivePreloadingStrategy implements PreloadingStrategy {
  private readonly auth = inject(AuthService);
  private readonly dataSaver = inject(DataSaverService);
  private readonly idle = inject(PRELOAD_IDLE);

  private active = 0;
  private readonly waiting: (() => void)[] = [];

  preload(route: Route, fn: () => Observable<any>): Observable<any> {
    // data_saver: the user asked for less downloading — preload nothing.
    if (this.dataSaver.enabled()) return of(null);
    if (route.data?.['preload'] === false) return of(null);
    const requiredPermissions = route.data?.['requiredPermissions'] as string[] | undefined;
    if (requiredPermissions && !this.auth.hasAnyPermission(requiredPermissions)) return of(null);

    return this.idle.pipe(
      switchMap(() => this.acquireSlot()),
      switchMap(() => defer(fn).pipe(finalize(() => this.releaseSlot()))),
    );
  }

  private acquireSlot(): Observable<void> {
    return new Observable<void>((subscriber) => {
      let cancelled = false;
      const start = () => {
        if (cancelled) {
          // Slot was handed to us after we unsubscribed; pass it on.
          this.releaseSlot();
          return;
        }
        subscriber.next();
        subscriber.complete();
      };
      if (this.active < MAX_CONCURRENT_PRELOADS) {
        this.active++;
        start();
      } else {
        this.waiting.push(() => {
          this.active++;
          start();
        });
      }
      return () => {
        cancelled = true;
      };
    });
  }

  private releaseSlot(): void {
    this.active = Math.max(0, this.active - 1);
    this.waiting.shift()?.();
  }
}
