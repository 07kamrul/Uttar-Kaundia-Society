import { DestroyRef, Injectable, inject } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { SKIP_LOADER } from '../interceptors/loader-context';
import { Observable, Subscription, catchError, map, of, timer } from 'rxjs';
import { environment } from '../../../environments/environment';

interface MediaTokenResponse {
  media_token: string;
  expires_in: number;
}

/** Refresh well before the backend's 30-minute expiry. */
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

// Module-level so the pure `toFileUrl()` helper can read it synchronously
// without every mapper needing an injected service.
let currentMediaToken: string | null = null;

/** Token appended as `?t=` to /uploads URLs; null when logged out. */
export function getMediaToken(): string | null {
  return currentMediaToken;
}

/**
 * Holds the short-lived media token the backend requires on every /uploads
 * request (<img>/<a> cannot send an Authorization header).
 */
@Injectable({ providedIn: 'root' })
export class MediaTokenService {
  private readonly http = inject(HttpClient);
  private refreshSub: Subscription | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clear());
  }

  /** Fetches a token now and keeps it fresh; never errors (files just 401). */
  start(): Observable<void> {
    this.refreshSub?.unsubscribe();
    this.refreshSub = timer(REFRESH_INTERVAL_MS, REFRESH_INTERVAL_MS).subscribe(() =>
      this.fetch().subscribe(),
    );
    return this.fetch();
  }

  clear(): void {
    this.refreshSub?.unsubscribe();
    this.refreshSub = null;
    currentMediaToken = null;
  }

  private fetch(): Observable<void> {
    return this.http.get<MediaTokenResponse>(`${environment.apiBaseUrl}/media-token`, {
      // Background refresh every few minutes — never show the global loader for it.
      context: new HttpContext().set(SKIP_LOADER, true),
    }).pipe(
      map((res) => {
        currentMediaToken = res.media_token;
      }),
      catchError(() => of(undefined)),
    );
  }
}
