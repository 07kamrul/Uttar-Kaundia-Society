import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router, convertToParamMap, type Params } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { FeatureFlagService } from '../services/feature-flag.service';
import { payMergedRedirect } from './pay-merged-redirect.guard';

function run(kind: 'installment' | 'other_fee' | 'cost_share', enabled: boolean, query: Params = {}) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: FeatureFlagService, useValue: { isEnabled: (key: string) => enabled && key === 'pay_merged_page' } },
    ],
  });
  const route = { queryParamMap: convertToParamMap(query) } as unknown as ActivatedRouteSnapshot;
  const result = TestBed.runInInjectionContext(() => payMergedRedirect(kind)(route, { url: '/x' } as never));
  return { result, router: TestBed.inject(Router) };
}

describe('payMergedRedirect', () => {
  it.each(['installment', 'other_fee', 'cost_share'] as const)('lets the old %s page open when the flag is off', (kind) => {
    expect(run(kind, false).result).toBe(true);
  });

  it.each([
    ['installment', '/payments?kind=installment'],
    ['other_fee', '/payments?kind=other_fee'],
    ['cost_share', '/payments?kind=cost_share'],
  ] as const)('sends %s to the merged page when the flag is on', (kind, url) => {
    const { result, router } = run(kind, true);
    expect(router.serializeUrl(result as never)).toBe(url);
  });

  it('turns ?type=picnic into kind=other_fee&fee=picnic', () => {
    const { result, router } = run('other_fee', true, { type: 'picnic' });
    expect(router.serializeUrl(result as never)).toBe('/payments?kind=other_fee&fee=picnic');
  });

  it('keeps the pay=1 deep link used by the profile button', () => {
    const { result, router } = run('installment', true, { pay: '1' });
    expect(router.serializeUrl(result as never)).toBe('/payments?kind=installment&pay=1');
  });
});
