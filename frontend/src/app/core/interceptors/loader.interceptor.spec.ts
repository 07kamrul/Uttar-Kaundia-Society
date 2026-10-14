import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, expect, it, vi } from 'vitest';
import { loaderInterceptor } from './loader.interceptor';
import { LOADER_MODE, SKIP_LOADER } from './loader-context';
import { LoaderService } from '../services/loader.service';
import { NetworkStatusService } from '../services/network-status.service';

describe('loaderInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let loader: LoaderService;
  let noteLatency: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    noteLatency = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([loaderInterceptor])),
        provideHttpClientTesting(),
        { provide: NetworkStatusService, useValue: { noteLatency } },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    loader = TestBed.inject(LoaderService);
  });

  afterEach(() => backend.verify());

  it('tracks a GET as a bar task until it succeeds', () => {
    http.get('/api/x').subscribe();
    expect(loader.activeCount()).toBe(1);
    expect(loader.mode()).toBe('bar');

    backend.expectOne('/api/x').flush({});
    expect(loader.activeCount()).toBe(0);
  });

  it('tracks a POST as an overlay task', () => {
    http.post('/api/x', {}).subscribe();
    expect(loader.mode()).toBe('overlay');
    backend.expectOne('/api/x').flush({});
  });

  it('ends the task when the request fails', () => {
    http.get('/api/x').subscribe({ error: () => undefined });
    backend.expectOne('/api/x').flush('no', { status: 500, statusText: 'Server Error' });

    expect(loader.activeCount()).toBe(0);
  });

  it('ends the task when the caller unsubscribes', () => {
    const sub = http.get('/api/x').subscribe();
    backend.expectOne('/api/x');
    sub.unsubscribe();

    expect(loader.activeCount()).toBe(0);
  });

  it('skips requests tagged with SKIP_LOADER', () => {
    http.get('/api/x', { context: new HttpContext().set(SKIP_LOADER, true) }).subscribe();

    expect(loader.activeCount()).toBe(0);
    backend.expectOne('/api/x').flush({});
  });

  it('honours an explicit LOADER_MODE', () => {
    http.get('/api/x', { context: new HttpContext().set(LOADER_MODE, 'overlay') }).subscribe();

    expect(loader.mode()).toBe('overlay');
    backend.expectOne('/api/x').flush({});
  });

  it('reports the elapsed time to the network-status service', () => {
    http.get('/api/x').subscribe();
    backend.expectOne('/api/x').flush({});

    expect(noteLatency).toHaveBeenCalledTimes(1);
    expect(noteLatency).toHaveBeenCalledWith(expect.any(Number));
    expect(noteLatency.mock.calls[0][0]).toBeGreaterThanOrEqual(0);
  });

  it('reports even when the request fails', () => {
    http.get('/api/x').subscribe({ error: () => undefined });
    backend.expectOne('/api/x').flush('no', { status: 500, statusText: 'Server Error' });

    expect(noteLatency).toHaveBeenCalledTimes(1);
  });
});
