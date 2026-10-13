import { inject } from '@angular/core';
import { Router, type CanActivateFn, type Params } from '@angular/router';
import { FeatureFlagService } from '../services/feature-flag.service';

type PayKind = 'installment' | 'other_fee' | 'cost_share';

/**
 * With `pay_merged_page` on, the three old payment routes land on the merged
 * /payments page; with it off the old page opens as before. The old picnic
 * link (?type=picnic) becomes kind=other_fee&fee=picnic.
 */
export const payMergedRedirect =
  (kind: PayKind): CanActivateFn =>
  (route) => {
    if (!inject(FeatureFlagService).isEnabled('pay_merged_page')) return true;
    const queryParams: Params = { kind };
    if (route.queryParamMap.get('type') === 'picnic') queryParams['fee'] = 'picnic';
    if (route.queryParamMap.get('pay') === '1') queryParams['pay'] = '1';
    return inject(Router).createUrlTree(['/payments'], { queryParams });
  };
