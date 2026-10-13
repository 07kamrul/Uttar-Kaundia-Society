import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { catchError, firstValueFrom, map, of, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { NO_CACHE } from '../interceptors/cache-context';
import { SKIP_LOADER } from '../interceptors/loader-context';

export const FEATURE_FLAG_KEYS = [
  'reg_occupation_optional',
  'reg_hide_nationality',
  'reg_road_optional',
  'reg_dag_unknown',
  'reg_add_property_button',
  'reg_min_one_proof',
  'password_policy_v2',
  'nav_merged_entries',
  'nav_advanced_section',
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];
export type FeatureFlags = Readonly<Record<FeatureFlagKey, boolean>>;

/** A slow flag endpoint must never hold the app hostage; give up and use the defaults. */
export const FEATURE_FLAG_TIMEOUT_MS = 4000;

const ALL_OFF: FeatureFlags = Object.freeze(
  Object.fromEntries(FEATURE_FLAG_KEYS.map((key) => [key, false])) as Record<FeatureFlagKey, boolean>,
);

interface FeatureFlagsApiModel {
  flags?: unknown;
}

/** Keeps only known keys with real booleans; everything else is treated as off. */
function toFlags(body: FeatureFlagsApiModel | null): FeatureFlags {
  const raw = body?.flags;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return ALL_OFF;
  const source = raw as Record<string, unknown>;
  return Object.fromEntries(FEATURE_FLAG_KEYS.map((key) => [key, source[key] === true])) as Record<
    FeatureFlagKey,
    boolean
  >;
}

/**
 * Server-controlled switches for the gradual UX simplification. Loaded once at
 * startup (see app.config.ts); any failure leaves every flag off so the app
 * always starts with the previous behaviour.
 */
@Injectable({ providedIn: 'root' })
export class FeatureFlagService {
  private readonly http = inject(HttpClient);
  private readonly state = signal<FeatureFlags>(ALL_OFF);

  /** Reactive snapshot; reading it in a template/computed tracks flag changes. */
  readonly flags = this.state.asReadonly();

  isEnabled(key: FeatureFlagKey): boolean {
    return this.state()[key] === true;
  }

  /** Fetches the flags. Never rejects; on failure the current values are kept (all-off at first load). */
  load(): Promise<void> {
    // Not cached and no loader: this runs before the first screen and must not flash a progress bar.
    const context = new HttpContext().set(NO_CACHE, true).set(SKIP_LOADER, true);
    return firstValueFrom(
      this.http.get<FeatureFlagsApiModel | null>(`${environment.apiBaseUrl}/public/feature-flags`, { context }).pipe(
        timeout(FEATURE_FLAG_TIMEOUT_MS),
        map((body) => ({ ok: true as const, flags: toFlags(body) })),
        catchError(() => of({ ok: false as const })),
      ),
    ).then((result) => {
      if (result.ok) this.state.set(result.flags);
    });
  }
}
