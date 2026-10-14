import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';
import bn from '../../../../../../public/i18n/bn.json';
import { AuthService } from '../../../../core/services/auth.service';
import { MembershipReviewComponent } from '../membership-review/membership-review.component';
import { SubmissionsListComponent } from '../submissions-list/submissions-list.component';
import { NoticesComponent } from '../notices/notices.component';
import { EventsComponent } from '../events/events.component';
import { NoticesEventsComponent } from '../notices-events/notices-events.component';
import { ApplicationsComponent } from './applications.component';

@Component({ selector: 'app-submissions-list', template: 'REGISTRATIONS' })
class SubmissionsStub {}
@Component({ selector: 'app-membership-review', template: 'MEMBERSHIP' })
class ReviewStub {}
@Component({ selector: 'app-notices', template: 'NOTICES' })
class NoticesStub {}
@Component({ selector: 'app-events', template: 'EVENTS' })
class EventsStub {}

async function applications(permissions: string[], url = '/applications') {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'applications', component: ApplicationsComponent }]),
      provideTranslateService(),
      { provide: AuthService, useValue: { hasPermission: (k: string) => permissions.includes(k), hasAnyPermission: (ks: string[]) => ks.some((k) => permissions.includes(k)) } },
    ],
  });
  TestBed.overrideComponent(ApplicationsComponent, {
    remove: { imports: [SubmissionsListComponent, MembershipReviewComponent] },
    add: { imports: [SubmissionsStub, ReviewStub] },
  });
  const t = TestBed.inject(TranslateService);
  t.setTranslation('bn', bn);
  t.use('bn');
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, ApplicationsComponent);
  harness.detectChanges();
  const el = harness.routeNativeElement as HTMLElement;
  return { harness, el, tab: (id: string) => el.querySelector(`[data-testid="tab-${id}"]`) as HTMLButtonElement | null };
}

describe('ApplicationsComponent', () => {
  it('shows both tabs with both permissions and opens on the registrations', async () => {
    const { el, tab } = await applications(['membership.review', 'membership_application.manage']);
    expect(tab('registrations')?.textContent).toContain('নতুন নিবন্ধন');
    expect(tab('membership')?.textContent).toContain('সদস্যপদের আবেদন');
    expect(el.textContent).toContain('REGISTRATIONS');
    expect(el.textContent).not.toContain('MEMBERSHIP');
  });

  it('hides the tab whose permission is missing', async () => {
    const onlyMembership = await applications(['membership_application.manage']);
    expect(onlyMembership.tab('registrations')).toBeNull();
    expect(onlyMembership.el.textContent).toContain('MEMBERSHIP');
    TestBed.resetTestingModule();
    const onlyRegistrations = await applications(['membership.review']);
    expect(onlyRegistrations.tab('membership')).toBeNull();
    expect(onlyRegistrations.el.textContent).toContain('REGISTRATIONS');
  });

  it('keeps the tab in ?tab= and reads it back', async () => {
    const { harness, el, tab } = await applications(['membership.review', 'membership_application.manage']);
    tab('membership')!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/applications?tab=membership');
    expect(el.textContent).toContain('MEMBERSHIP');
    TestBed.resetTestingModule();
    const again = await applications(['membership.review', 'membership_application.manage'], '/applications?tab=membership');
    expect(again.tab('membership')?.getAttribute('aria-selected')).toBe('true');
    expect(again.el.textContent).toContain('MEMBERSHIP');
  });

  it('ignores a ?tab= the admin may not open', async () => {
    const { el } = await applications(['membership.review'], '/applications?tab=membership');
    expect(el.textContent).toContain('REGISTRATIONS');
  });
});

describe('NoticesEventsComponent', () => {
  async function render(url = '/notices-events') {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'notices-events', component: NoticesEventsComponent }]), provideTranslateService()],
    });
    TestBed.overrideComponent(NoticesEventsComponent, {
      remove: { imports: [NoticesComponent, EventsComponent] },
      add: { imports: [NoticesStub, EventsStub] },
    });
    const t = TestBed.inject(TranslateService);
    t.setTranslation('bn', bn);
    t.use('bn');
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, NoticesEventsComponent);
    harness.detectChanges();
    return { harness, el: harness.routeNativeElement as HTMLElement };
  }

  it('hosts notices first and events on the second tab', async () => {
    const { harness, el } = await render();
    expect(el.textContent).toContain('নোটিশ ও অনুষ্ঠান');
    expect(el.textContent).toContain('NOTICES');
    expect(el.textContent).not.toContain('EVENTS');
    (el.querySelector('[data-testid="tab-events"]') as HTMLButtonElement).click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(el.textContent).toContain('EVENTS');
    expect(TestBed.inject(Router).url).toBe('/notices-events?tab=events');
  });

  it('opens the events tab from ?tab=events', async () => {
    const { el } = await render('/notices-events?tab=events');
    expect(el.textContent).toContain('EVENTS');
  });
});
