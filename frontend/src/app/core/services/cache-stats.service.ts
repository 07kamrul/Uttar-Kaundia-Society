import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, type Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface CacheStat {
  name: string;
  size: number;
  maxSize: number;
  ttlSeconds: number;
  hitRatio: number;
  invalidations: number;
}

export interface CacheStats {
  enabled: boolean;
  caches: CacheStat[];
}

interface CacheStatsApi {
  enabled: boolean;
  caches: Array<{ name: string; size: number; maxsize: number; ttl_seconds: number; hit_ratio: number; invalidations: number }>;
}

/** Read-only view of GET /api/admin/cache/stats. There is deliberately no flush call here. */
@Injectable({ providedIn: 'root' })
export class CacheStatsService {
  private readonly http = inject(HttpClient);

  stats(): Observable<CacheStats> {
    return this.http.get<CacheStatsApi>(`${environment.apiBaseUrl}/admin/cache/stats`).pipe(
      map((api) => ({
        enabled: api.enabled,
        caches: api.caches.map((c) => ({
          name: c.name,
          size: c.size,
          maxSize: c.maxsize,
          ttlSeconds: c.ttl_seconds,
          hitRatio: c.hit_ratio,
          invalidations: c.invalidations,
        })),
      })),
    );
  }
}
