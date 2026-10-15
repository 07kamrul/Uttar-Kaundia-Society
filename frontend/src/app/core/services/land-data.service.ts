import { Injectable } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { Observable, catchError, shareReplay, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { NO_CACHE } from '../interceptors/cache-context';

type MapLayer = 'dags' | 'masterplan';

/** Distinct (layer, bbox) downloads kept per session; the map asks for one bbox per layer. */
const LAYER_CACHE_MAX_ENTRIES = 4;

/** One khatian row of a dag, as served by GET /land/dag/{survey}/{sheet}/{dag}. */
export interface DagKhatian {
  /** Khatian number (ASCII digits). */
  khatian_no: string;
  /** Recorded owner names, top to bottom as printed on the portal (verbatim). */
  owners: string[];
  /** Known stage code ("objection" | "appeal"), null when the source stage is unmapped. */
  stage_code: string | null;
  /** Stage text exactly as published (Bangla). */
  stage_bn: string;
}

export interface DagDetails {
  survey: string;
  sheet: string;
  dag: string;
  mouza: {
    name_bn: string;
    name_en: string;
    upazila_bn: string;
    upazila_en: string;
    district_bn: string;
    district_en: string;
  };
  /** Official "মোট জমি" number as published, with its verified unit. */
  total_land: { value: number; unit: string };
  khatians: DagKhatian[];
  /** "hidden_by_source" when the portal withholds this dag's khatians. */
  source_note: string | null;
  source: { name: string; fetched_at: string; dataset_version: string };
}

/** Minimal GeoJSON shapes as served by our /api/land endpoints. */
export interface LandPlotFeature {
  type: 'Feature';
  properties: {
    dag?: string;
    label_bn?: string;
    sheet?: string;
    survey?: string;
    area_sqm?: number;
    plot_no?: number;
    rs_plot_no?: string;
    address_search?: string;
    [key: string]: unknown;
  };
  geometry: { type: string; coordinates: number[][][] | number[][][][] };
}

export interface LandFeatureCollection {
  type: 'FeatureCollection';
  count: number;
  truncated?: boolean;
  features: LandPlotFeature[];
}

/**
 * Local land dataset (ingested BDS mouza map + RAJUK DAP overlay) served
 * through our own authenticated /api/land endpoints. No external map sites
 * are contacted at runtime.
 */
@Injectable({ providedIn: 'root' })
export class LandDataService {
  /**
   * The map layers only change on redeploy, so each download is kept for the
   * session (and revalidated by ETag across reloads). In-flight requests are
   * shared, failures are forgotten so the next call retries. Subscribers get
   * the same collection object and must treat it as read-only.
   */
  private readonly layerCache = new Map<string, Observable<LandFeatureCollection>>();

  constructor(private http: HttpClient) {}

  /** Forgets downloaded map layers; called on logout. */
  clearCache(): void {
    this.layerCache.clear();
  }

  /**
   * Land details + khatian/owner rows for one dag. Members only, rate-limited
   * and audited server-side, so it is fetched lazily per opened dialog and
   * never cached or prefetched.
   */
  dagDetails(survey: string, sheet: string, dag: string): Observable<DagDetails> {
    return this.http.get<DagDetails>(
      `${environment.apiBaseUrl}/land/dag/${encodeURIComponent(survey)}/${encodeURIComponent(sheet)}/${encodeURIComponent(dag)}`,
    );
  }

  /** BDS dag polygons for the viewport (minLng,minLat,maxLng,maxLat order). */
  dagsInBbox(bbox: string): Observable<LandFeatureCollection> {
    return this.cachedLayer('dags', bbox);
  }

  /** Every sheet containing a BDS dag number (Bangla digits accepted). */
  lookupDag(survey: string, dagNo: string): Observable<LandFeatureCollection> {
    return this.http.get<LandFeatureCollection>(
      `${environment.apiBaseUrl}/land/dag/${survey}/lookup/${encodeURIComponent(dagNo)}`,
    );
  }

  /** RAJUK DAP 2022–2035 RS plots for the viewport. */
  masterplanInBbox(bbox: string): Observable<LandFeatureCollection> {
    return this.cachedLayer('masterplan', bbox);
  }

  /** RS plots matching a dag number ("4611", "RS-4611", Bangla digits). */
  lookupRsPlot(rsPlotNo: string): Observable<LandFeatureCollection> {
    return this.http.get<LandFeatureCollection>(
      `${environment.apiBaseUrl}/land/masterplan/lookup/${encodeURIComponent(rsPlotNo)}`,
    );
  }

  private cachedLayer(layer: MapLayer, bbox: string): Observable<LandFeatureCollection> {
    const key = `${layer}|${bbox}`;
    const cached = this.layerCache.get(key);
    if (cached) return cached;
    const request$: Observable<LandFeatureCollection> = this.http
      .get<LandFeatureCollection>(`${environment.apiBaseUrl}/land/${layer}`, {
        params: { bbox },
        // The generic GET cache deep-copies every body per hit; this one shares it.
        context: new HttpContext().set(NO_CACHE, true),
      })
      .pipe(
        catchError((error: unknown) => {
          // Only evict our own entry: a logout may have replaced it meanwhile.
          if (this.layerCache.get(key) === request$) this.layerCache.delete(key);
          return throwError(() => error);
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    this.layerCache.set(key, request$);
    this.evictOldestLayers();
    return request$;
  }

  private evictOldestLayers(): void {
    while (this.layerCache.size > LAYER_CACHE_MAX_ENTRIES) {
      const oldest = this.layerCache.keys().next().value;
      if (oldest === undefined) return;
      this.layerCache.delete(oldest);
    }
  }
}
