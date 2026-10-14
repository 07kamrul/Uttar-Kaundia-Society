import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../../../../public/i18n/bn.json';
import { CacheStatsService, type CacheStats } from '../../../../core/services/cache-stats.service';
import { CacheStatsComponent } from './cache-stats.component';

const STATS: CacheStats = {
  enabled: true,
  caches: [
    { name: 'permissions', size: 3, maxSize: 100, ttlSeconds: 60, hitRatio: 0.9, invalidations: 2 },
    { name: 'public_lists', size: 0, maxSize: 50, ttlSeconds: 300, hitRatio: 0, invalidations: 0 },
  ],
};

function setup(stats$ = of(STATS)) {
  const stats = vi.fn(() => stats$);
  TestBed.configureTestingModule({
    imports: [CacheStatsComponent],
    providers: [provideTranslateService(), { provide: CacheStatsService, useValue: { stats } }],
  });
  const t = TestBed.inject(TranslateService);
  t.setTranslation('bn', bn);
  t.use('bn');
  const fixture = TestBed.createComponent(CacheStatsComponent);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, stats };
}

describe('CacheStatsComponent', () => {
  it('shows name, entries/max, TTL, hit ratio and invalidations per cache', () => {
    const { el } = setup();
    const rows = [...el.querySelectorAll('tbody tr')] as HTMLElement[];
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('permissions');
    expect(rows[0].textContent).toContain('৩ / ১০০');
    expect(rows[0].textContent).toContain('৬০');
    expect(rows[0].textContent).toContain('৯০%');
    expect(rows[0].textContent).toContain('২');
  });

  it('refreshes on demand', () => {
    const { fixture, el, stats } = setup();
    (el.querySelector('[data-testid="cache-refresh"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(stats).toHaveBeenCalledTimes(2);
  });

  it('has no flush or clear button anywhere', () => {
    const { el } = setup();
    const labels = [...el.querySelectorAll('button')].map((b) => `${b.textContent} ${b.getAttribute('data-testid')}`.toLowerCase());
    expect(labels.some((l) => /flush|clear|ফ্লাশ|মুছে/.test(l))).toBe(false);
    expect(labels.length).toBe(1);
  });

  it('shows an error with retry when loading fails', () => {
    const { el } = setup(throwError(() => new Error('x')));
    expect(el.querySelector('[data-testid="cache-error"]')).not.toBeNull();
  });
});
