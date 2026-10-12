import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { Observable, Subject, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { LoaderService } from '../../../../core/services/loader.service';
import { GovernanceService } from '../../../../core/services/governance.service';
import { ServiceStandardComponent } from './service-standard.component';

const payload = {
  anti_retaliation_notice: 'notice text',
  standards: [
    { key: 'a', bn: 'কার্ড ১', target: '৩ কার্যদিবস', live: { total: 4, met: 4, met_pct: 100 } },
    { key: 'b', bn: 'কার্ড ২', target: '৭ কার্যদিবস', live: null },
  ],
};

describe('ServiceStandardComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(result: Observable<typeof payload> = of(payload)) {
    const serviceStandard = vi.fn(() => result);
    TestBed.configureTestingModule({
      imports: [ServiceStandardComponent],
      providers: [
        provideTranslateService(),
        { provide: GovernanceService, useValue: { serviceStandard } },
      ],
    });
    const fixture = TestBed.createComponent(ServiceStandardComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, serviceStandard };
  }

  it('shows the skeleton while the data is in flight', () => {
    const subject = new Subject<typeof payload>();
    const { el } = setup(subject as Observable<typeof payload>);

    expect(el.querySelector('app-section-loader')).not.toBeNull();
    expect(el.querySelectorAll('.ss-card').length).toBe(0);
  });

  it('hides the skeleton and renders the cards once data arrives', () => {
    const { fixture, el } = setup();

    vi.advanceTimersByTime(LoaderService.MIN_VISIBLE_MS);
    fixture.detectChanges();

    expect(el.querySelector('app-section-loader')).toBeNull();
    expect(el.querySelectorAll('.ss-card').length).toBe(2);
    expect(fixture.componentInstance.antiRetaliation()).toBe('notice text');
  });

  it('keeps the skeleton for the minimum display time when the response is instant', () => {
    const { fixture, el } = setup();

    // of() already emitted synchronously — data is here, but the skeleton must
    // still be visible so a fast response cannot skip the loading state.
    expect(fixture.componentInstance.loading()).toBe(true);
    expect(el.querySelector('app-section-loader')).not.toBeNull();

    vi.advanceTimersByTime(LoaderService.MIN_VISIBLE_MS - 1);
    expect(fixture.componentInstance.loading()).toBe(true);

    vi.advanceTimersByTime(1);
    fixture.detectChanges();

    expect(fixture.componentInstance.loading()).toBe(false);
    expect(el.querySelector('app-section-loader')).toBeNull();
    expect(el.querySelectorAll('.ss-card').length).toBe(2);
  });

  it('shows an error box with a retry button when loading fails', () => {
    const { fixture, el } = setup(throwError(() => new Error('boom')));

    vi.advanceTimersByTime(LoaderService.MIN_VISIBLE_MS);
    fixture.detectChanges();

    expect(el.querySelector('.error-box')).not.toBeNull();
    expect(el.querySelector('.retry-btn')).not.toBeNull();
  });

  it('re-fetches through the retry button', () => {
    let calls = 0;
    const serviceStandard = vi.fn(() => {
      calls += 1;
      return calls === 1 ? throwError(() => new Error('boom')) : of(payload);
    });
    TestBed.configureTestingModule({
      imports: [ServiceStandardComponent],
      providers: [
        provideTranslateService(),
        { provide: GovernanceService, useValue: { serviceStandard } },
      ],
    });
    const fixture = TestBed.createComponent(ServiceStandardComponent);
    fixture.detectChanges();
    vi.advanceTimersByTime(LoaderService.MIN_VISIBLE_MS);
    fixture.detectChanges();

    const retry = fixture.nativeElement.querySelector('.retry-btn') as HTMLButtonElement;
    retry.click();
    fixture.detectChanges();

    expect(serviceStandard).toHaveBeenCalledTimes(2);
    // Skeleton is back while the retry is in flight.
    expect(fixture.componentInstance.loading()).toBe(true);

    vi.advanceTimersByTime(LoaderService.MIN_VISIBLE_MS);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.ss-card').length).toBe(2);
  });
});
