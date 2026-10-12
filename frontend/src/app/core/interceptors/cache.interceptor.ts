import type { HttpEvent, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { HttpResponse } from '@angular/common/http';
import { Observable, finalize, map, of, share, tap } from 'rxjs';
import { NO_CACHE } from './cache-context';
import { SKIP_LOADER } from './loader-context';

/** How long a successful GET stays reusable. Short so other users' changes still show up soon. */
export const CACHE_TTL_MS = 60_000;
export const CACHE_MAX_ENTRIES = 100;

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

interface CacheEntry {
  readonly storedAt: number;
  readonly response: HttpResponse<unknown>;
}

const entries = new Map<string, CacheEntry>();
const inFlight = new Map<string, Observable<HttpEvent<unknown>>>();
// Bumped on every write so a GET that was already in flight when the write
// happened cannot store its (now stale) answer afterwards.
let generation = 0;

/** Drops every cached response; also used on logout. */
export function clearHttpCache(): void {
  generation++;
  entries.clear();
  inFlight.clear();
}

function isCacheable(req: HttpRequest<unknown>): boolean {
  return (
    req.method === 'GET' &&
    req.responseType === 'json' &&
    req.url.includes('/api/') &&
    !req.url.includes('/api/auth/') &&
    !req.context.get(NO_CACHE) &&
    // Background calls (polling, live quotes) are exempt from the loader because
    // they must stay live; they must stay live here too.
    !req.context.get(SKIP_LOADER)
  );
}

// The Authorization header is part of the key so one account can never be served
// another account's cached data after a logout/login on the same tab.
function cacheKey(req: HttpRequest<unknown>): string {
  return `${req.headers.get('Authorization') ?? ''}|${req.urlWithParams}`;
}

function cloneResponse(source: HttpResponse<unknown>): HttpResponse<unknown> {
  // Callers may mutate what they receive; never hand out the cached object itself.
  const body = source.body === null ? null : structuredClone(source.body);
  return source.clone({ body });
}

function evictOldest(): void {
  while (entries.size > CACHE_MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) return;
    entries.delete(oldest);
  }
}

export const cacheInterceptor: HttpInterceptorFn = (req, next) => {
  if (!READ_METHODS.has(req.method)) {
    // A failed write (5xx, timeout) may still have changed server state, so errors clear too.
    return next(req).pipe(
      tap({
        next: (event) => {
          if (event instanceof HttpResponse) clearHttpCache();
        },
        error: () => clearHttpCache(),
      }),
    );
  }
  if (!isCacheable(req)) return next(req);

  const key = cacheKey(req);
  const hit = entries.get(key);
  if (hit && Date.now() - hit.storedAt < CACHE_TTL_MS) return of(cloneResponse(hit.response));
  if (hit) entries.delete(key);

  let shared = inFlight.get(key);
  if (!shared) {
    const startedAt = generation;
    shared = next(req).pipe(
      tap((event) => {
        if (event instanceof HttpResponse && startedAt === generation) {
          entries.set(key, { storedAt: Date.now(), response: cloneResponse(event) });
          evictOldest();
        }
      }),
      finalize(() => {
        // A write may have cleared the map and a newer request re-registered this key.
        if (inFlight.get(key) === shared) inFlight.delete(key);
      }),
      share(),
    );
    inFlight.set(key, shared);
  }

  // Concurrent identical GETs share one network call but each get their own copy.
  return shared.pipe(map((event) => (event instanceof HttpResponse ? cloneResponse(event) : event)));
};
