import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';
import bn from '../../../../public/i18n/bn.json';
import { FeatureFlagService } from '../../core/services/feature-flag.service';
import { NetworkStatusService } from '../../core/services/network-status.service';
import { NetStatusBannerComponent } from './net-status-banner.component';

function create(flags: string[], problem: () => string | null) {
  TestBed.configureTestingModule({
    imports: [NetStatusBannerComponent],
    providers: [
      provideTranslateService(),
      {
        provide: FeatureFlagService,
        useValue: { isEnabled: (k: string) => flags.includes(k) },
      },
      { provide: NetworkStatusService, useValue: { problem, reconnected$: new Subject<void>().asObservable() } },
    ],
  });
  const t = TestBed.inject(TranslateService);
  t.setTranslation('bn', bn);
  t.use('bn');
  const fixture = TestBed.createComponent(NetStatusBannerComponent);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('NetStatusBannerComponent', () => {
  it('renders nothing while net_status_banner is off, even when offline', () => {
    const { el } = create([], () => 'offline');
    expect(el.querySelector('[role="status"]')).toBeNull();
  });

  it('shows the offline message when the network is down', () => {
    const { el } = create(['net_status_banner'], () => 'offline');
    const banner = el.querySelector('[role="status"]') as HTMLElement;
    expect(banner.getAttribute('aria-live')).toBe('polite');
    expect(banner.textContent).toContain(bn.netStatus.offline);
  });

  it('shows the slow message while the network is slow', () => {
    const { el } = create(['net_status_banner'], () => 'slow');
    expect((el.querySelector('[role="status"]') as HTMLElement).textContent).toContain(bn.netStatus.slow);
  });

  it('shows nothing while the connection is fine', () => {
    const { el } = create(['net_status_banner'], () => null);
    expect(el.querySelector('[role="status"]')).toBeNull();
  });
});
