import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { FEATURE_FLAG_KEYS, FeatureFlagService } from './feature-flag.service';

const URL = `${environment.apiBaseUrl}/public/feature-flags`;

describe('FeatureFlagService', () => {
  let http: HttpTestingController;
  let service: FeatureFlagService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(FeatureFlagService);
  });

  afterEach(() => http.verify());

  it('is all-false before anything is loaded', () => {
    for (const key of FEATURE_FLAG_KEYS) expect(service.isEnabled(key)).toBe(false);
  });

  it('declares every agreed flag key', () => {
    expect([...FEATURE_FLAG_KEYS].sort()).toEqual(
      [
        'reg_occupation_optional',
        'reg_hide_nationality',
        'reg_road_optional',
        'reg_dag_unknown',
        'reg_add_property_button',
        'reg_min_one_proof',
        'reg_abroad_address',
        'reg_simplified_ui',
        'password_policy_v2',
        'nav_merged_entries',
        'nav_advanced_section',
        'pay_merged_page',
        'nav_five_areas',
        'map_wizard',
        'admin_console',
        'admin_bulk_verify',
        'fee_wizard',
        'login_by_phone',
        'ui_a11y_v2',
        'data_saver',
        'net_status_banner',
      ].sort(),
    );
  });

  it('loads flags from the public endpoint and exposes them via isEnabled and the signal', async () => {
    const done = service.load();
    http.expectOne(URL).flush({ flags: { reg_dag_unknown: true, reg_road_optional: false } });
    await done;

    expect(service.isEnabled('reg_dag_unknown')).toBe(true);
    expect(service.isEnabled('reg_road_optional')).toBe(false);
    expect(service.isEnabled('nav_advanced_section')).toBe(false);
    expect(service.flags()['reg_dag_unknown']).toBe(true);
  });

  it('ignores unknown keys and non-boolean values from the server', async () => {
    const done = service.load();
    http.expectOne(URL).flush({
      flags: { reg_dag_unknown: 'yes', reg_road_optional: 1, brand_new_flag: true, nav_merged_entries: true },
    });
    await done;

    expect(service.isEnabled('reg_dag_unknown')).toBe(false);
    expect(service.isEnabled('reg_road_optional')).toBe(false);
    expect(service.isEnabled('nav_merged_entries')).toBe(true);
    expect(Object.keys(service.flags())).not.toContain('brand_new_flag');
  });

  it.each([
    ['server error', { status: 500, statusText: 'Server Error' }],
    ['network failure', { status: 0, statusText: 'Unknown Error' }],
    ['not found', { status: 404, statusText: 'Not Found' }],
  ])('falls back to all-false and resolves on %s', async (_label, init) => {
    const done = service.load();
    http.expectOne(URL).flush(null, init);
    await expect(done).resolves.toBeUndefined();

    for (const key of FEATURE_FLAG_KEYS) expect(service.isEnabled(key)).toBe(false);
  });

  it.each([[null], [{}], [{ flags: null }], [{ flags: 'x' }], [{ flags: [true] }]])(
    'treats a malformed body %j as all-false',
    async (body) => {
      const done = service.load();
      http.expectOne(URL).flush(body);
      await done;
      for (const key of FEATURE_FLAG_KEYS) expect(service.isEnabled(key)).toBe(false);
    },
  );

  it('does not block startup when the request never answers within the timeout', async () => {
    vi.useFakeTimers();
    try {
      const done = service.load();
      http.expectOne(URL);
      await vi.advanceTimersByTimeAsync(10_000);
      await expect(done).resolves.toBeUndefined();
      expect(service.isEnabled('reg_dag_unknown')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps previously loaded flags if a reload fails', async () => {
    const first = service.load();
    http.expectOne(URL).flush({ flags: { reg_dag_unknown: true } });
    await first;

    const second = service.load();
    http.expectOne(URL).flush(null, { status: 500, statusText: 'x' });
    await second;

    expect(service.isEnabled('reg_dag_unknown')).toBe(true);
  });
});
