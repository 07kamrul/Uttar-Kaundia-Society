import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LandDataService, LandFeatureCollection } from './land-data.service';
import { NO_CACHE } from '../interceptors/cache-context';

const BBOX = '90.3,23.78,90.347,23.838';

const COLLECTION: LandFeatureCollection = { type: 'FeatureCollection', count: 0, features: [] };

describe('LandDataService map layers', () => {
  let http: HttpTestingController;
  let service: LandDataService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(LandDataService);
  });

  afterEach(() => http.verify());

  it('downloads a layer once per session and serves later calls from memory', () => {
    const received: LandFeatureCollection[] = [];
    service.dagsInBbox(BBOX).subscribe((c) => received.push(c));
    service.dagsInBbox(BBOX).subscribe((c) => received.push(c)); // while in flight

    const req = http.expectOne((r) => r.url.endsWith('/land/dags'));
    expect(req.request.params.get('bbox')).toBe(BBOX);
    req.flush(COLLECTION);

    service.dagsInBbox(BBOX).subscribe((c) => received.push(c)); // after it landed
    http.expectNone((r) => r.url.endsWith('/land/dags'));
    expect(received).toEqual([COLLECTION, COLLECTION, COLLECTION]);
  });

  it('bypasses the short-lived generic GET cache, which would deep-copy megabytes per hit', () => {
    service.masterplanInBbox(BBOX).subscribe();
    const req = http.expectOne((r) => r.url.endsWith('/land/masterplan'));
    expect(req.request.context.get(NO_CACHE)).toBe(true);
    req.flush(COLLECTION);
  });

  it('keeps dags and masterplan layers apart', () => {
    service.dagsInBbox(BBOX).subscribe();
    service.masterplanInBbox(BBOX).subscribe();
    http.expectOne((r) => r.url.endsWith('/land/dags')).flush(COLLECTION);
    http.expectOne((r) => r.url.endsWith('/land/masterplan')).flush(COLLECTION);
  });

  it('forgets a failed download so the next attempt retries', () => {
    let failed = false;
    service.dagsInBbox(BBOX).subscribe({ error: () => (failed = true) });
    http
      .expectOne((r) => r.url.endsWith('/land/dags'))
      .flush('x', { status: 503, statusText: 'down' });
    expect(failed).toBe(true);

    service.dagsInBbox(BBOX).subscribe();
    http.expectOne((r) => r.url.endsWith('/land/dags')).flush(COLLECTION);
  });

  it('drops cached layers on clearCache (logout)', () => {
    service.dagsInBbox(BBOX).subscribe();
    http.expectOne((r) => r.url.endsWith('/land/dags')).flush(COLLECTION);

    service.clearCache();
    service.dagsInBbox(BBOX).subscribe();
    http.expectOne((r) => r.url.endsWith('/land/dags')).flush(COLLECTION);
  });
});
