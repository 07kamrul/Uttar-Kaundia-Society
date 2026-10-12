import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { CACHE_MAX_ENTRIES, CACHE_TTL_MS, cacheInterceptor, clearHttpCache } from './cache.interceptor';
import { NO_CACHE } from './cache-context';
import { SKIP_LOADER } from './loader-context';

describe('cacheInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;

  beforeEach(() => {
    clearHttpCache();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([cacheInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    backend.verify();
    vi.restoreAllMocks();
  });

  it('serves a repeated GET from memory without a second request', () => {
    const results: unknown[] = [];
    http.get('/api/items').subscribe((r) => results.push(r));
    backend.expectOne('/api/items').flush({ n: 1 });

    http.get('/api/items').subscribe((r) => results.push(r));
    backend.expectNone('/api/items');

    expect(results).toEqual([{ n: 1 }, { n: 1 }]);
  });

  it('shares one network call between concurrent identical GETs', () => {
    const results: unknown[] = [];
    http.get('/api/items').subscribe((r) => results.push(r));
    http.get('/api/items').subscribe((r) => results.push(r));

    backend.expectOne('/api/items').flush({ n: 2 });

    expect(results).toEqual([{ n: 2 }, { n: 2 }]);
  });

  it('hands each caller its own copy so mutation cannot corrupt the cache', () => {
    http.get<{ n: number }>('/api/items').subscribe();
    backend.expectOne('/api/items').flush({ n: 3 });

    let first: { n: number } | undefined;
    http.get<{ n: number }>('/api/items').subscribe((r) => (first = r));
    first!.n = 99;

    let second: { n: number } | undefined;
    http.get<{ n: number }>('/api/items').subscribe((r) => (second = r));
    expect(second).toEqual({ n: 3 });
  });

  it('treats different query strings as different entries', () => {
    http.get('/api/items', { params: { page: 1 } }).subscribe();
    backend.expectOne('/api/items?page=1').flush([]);

    http.get('/api/items', { params: { page: 2 } }).subscribe();
    backend.expectOne('/api/items?page=2').flush([]);
  });

  it('refetches once the entry is older than the TTL', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    http.get('/api/items').subscribe();
    backend.expectOne('/api/items').flush({ n: 1 });

    now.mockReturnValue(1_000 + CACHE_TTL_MS + 1);
    http.get('/api/items').subscribe();
    backend.expectOne('/api/items').flush({ n: 2 });
  });

  it('clears the cache after any successful write', () => {
    http.get('/api/items').subscribe();
    backend.expectOne('/api/items').flush({ n: 1 });

    http.post('/api/items', {}).subscribe();
    backend.expectOne('/api/items').flush({});

    http.get('/api/items').subscribe();
    backend.expectOne('/api/items').flush({ n: 2 });
  });

  it('clears the cache when a write fails, since the server may have changed anyway', () => {
    http.get('/api/items').subscribe();
    backend.expectOne('/api/items').flush({ n: 1 });

    http.post('/api/items', {}).subscribe({ error: () => undefined });
    backend.expectOne('/api/items').flush('no', { status: 500, statusText: 'Server Error' });

    http.get('/api/items').subscribe();
    backend.expectOne('/api/items').flush({ n: 2 });
  });

  it('does not store an answer to a GET that was in flight when a write happened', () => {
    http.get('/api/items').subscribe();
    const pendingGet = backend.expectOne('/api/items');

    http.post('/api/items', {}).subscribe();
    backend.expectOne((r) => r.method === 'POST').flush({});
    pendingGet.flush({ n: 'stale' });

    http.get('/api/items').subscribe();
    backend.expectOne('/api/items').flush({ n: 'fresh' });
  });

  it('never caches errors', () => {
    http.get('/api/items').subscribe({ error: () => undefined });
    backend.expectOne('/api/items').flush('no', { status: 500, statusText: 'Server Error' });

    http.get('/api/items').subscribe();
    backend.expectOne('/api/items').flush({ n: 1 });
  });

  it('bypasses the cache for NO_CACHE, SKIP_LOADER, auth and non-API requests', () => {
    const noCache = new HttpContext().set(NO_CACHE, true);
    const background = new HttpContext().set(SKIP_LOADER, true);
    const urls: [string, HttpContext | undefined][] = [
      ['/api/live', noCache],
      ['/api/poll', background],
      ['/api/auth/me', undefined],
      ['/i18n/bn.json', undefined],
    ];

    for (const [url, context] of urls) {
      http.get(url, { context }).subscribe();
      backend.expectOne(url).flush({});
      http.get(url, { context }).subscribe();
      backend.expectOne(url).flush({});
    }
  });

  it('does not share entries between different Authorization headers', () => {
    http.get('/api/items', { headers: { Authorization: 'Bearer a' } }).subscribe();
    backend.expectOne('/api/items').flush({ who: 'a' });

    http.get('/api/items', { headers: { Authorization: 'Bearer b' } }).subscribe();
    backend.expectOne('/api/items').flush({ who: 'b' });
  });

  it('clearHttpCache empties everything', () => {
    http.get('/api/items').subscribe();
    backend.expectOne('/api/items').flush({ n: 1 });

    clearHttpCache();

    http.get('/api/items').subscribe();
    backend.expectOne('/api/items').flush({ n: 2 });
  });

  it('evicts the oldest entries beyond the size limit', () => {
    for (let i = 0; i <= CACHE_MAX_ENTRIES; i++) {
      http.get(`/api/item/${i}`).subscribe();
      backend.expectOne(`/api/item/${i}`).flush({ i });
    }

    http.get('/api/item/0').subscribe();
    backend.expectOne('/api/item/0').flush({ i: 0 });
  });
});
