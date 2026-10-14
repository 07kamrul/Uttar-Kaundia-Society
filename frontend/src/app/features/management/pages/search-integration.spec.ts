import type { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../../../public/i18n/bn.json';
import type { SubmissionSummary } from '../../../core/models/admin.model';
import { AdminService } from '../../../core/services/admin.service';
import { AuthService } from '../../../core/services/auth.service';
import { FeatureFlagService, type FeatureFlagKey } from '../../../core/services/feature-flag.service';
import { QueueSearchComponent } from '../../../shared/queue-search/queue-search.component';
import { MembersListComponent } from './members-list/members-list.component';
import { MembershipReviewComponent } from './membership-review/membership-review.component';
import { SubmissionsListComponent } from './submissions-list/submissions-list.component';

const submission = (id: string, needsDag: boolean): SubmissionSummary => ({
  id,
  fullName: `সদস্য ${id}`,
  mobile: '01711111111',
  status: 'pending',
  createdAt: '2026-01-01T00:00:00Z',
  needsDag,
});

function admin() {
  return {
    listSubmissions: vi.fn((..._a: unknown[]) => of([submission('1', true), submission('2', false)])),
    listMembers: vi.fn((..._a: unknown[]) => of([])),
    listApplications: vi.fn((..._a: unknown[]) => of([])),
  };
}

async function render<T>(component: Type<T>, flags: FeatureFlagKey[], url = '/page') {
  const service = admin();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'page', component }]),
      provideTranslateService(),
      { provide: AdminService, useValue: service },
      { provide: FeatureFlagService, useValue: { isEnabled: (k: FeatureFlagKey) => flags.includes(k) } },
      { provide: AuthService, useValue: { hasPermission: () => true, hasAnyPermission: () => true, role: 'executive_committee' } },
    ],
  });
  const t = TestBed.inject(TranslateService);
  t.setTranslation('bn', bn);
  t.use('bn');
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, component);
  harness.detectChanges();
  const search = harness.fixture.debugElement.query(By.directive(QueueSearchComponent))?.componentInstance as QueueSearchComponent | undefined;
  return { harness, service, search, el: harness.routeNativeElement as HTMLElement };
}

describe('queue search on the admin lists', () => {
  it('submissions: no search box with admin_console off', async () => {
    const { search } = await render(SubmissionsListComponent, []);
    expect(search).toBeUndefined();
  });

  it('submissions: the search term is sent with the status filter', async () => {
    const { harness, service, search } = await render(SubmissionsListComponent, ['admin_console']);
    expect(search).toBeDefined();
    search!.search.emit('0171');
    harness.detectChanges();
    expect(service.listSubmissions).toHaveBeenLastCalledWith('pending', '0171');
    search!.search.emit('');
    expect(service.listSubmissions).toHaveBeenLastCalledWith('pending', undefined);
  });

  it('submissions: ?needs_dag=1 shows only the rows that need a dag', async () => {
    const { el } = await render(SubmissionsListComponent, ['admin_console'], '/page?needs_dag=1');
    expect(el.querySelectorAll('tbody tr').length).toBe(1);
    expect(el.textContent).toContain('সদস্য 1');
    expect(el.textContent).not.toContain('সদস্য 2');
  });

  it('submissions: needs_dag is ignored while admin_console is off', async () => {
    const { el } = await render(SubmissionsListComponent, [], '/page?needs_dag=1');
    expect(el.querySelectorAll('tbody tr').length).toBe(2);
  });

  it('members: no search box when off, search sends the term when on', async () => {
    const off = await render(MembersListComponent, []);
    expect(off.search).toBeUndefined();
    TestBed.resetTestingModule();
    const on = await render(MembersListComponent, ['admin_console']);
    on.search!.search.emit('UKAMKS-12');
    expect(on.service.listMembers).toHaveBeenLastCalledWith('UKAMKS-12');
  });

  it('membership applications: search sends the term with the status filter', async () => {
    const off = await render(MembershipReviewComponent, []);
    expect(off.search).toBeUndefined();
    TestBed.resetTestingModule();
    const on = await render(MembershipReviewComponent, ['admin_console']);
    on.search!.search.emit('করিম');
    expect(on.service.listApplications).toHaveBeenLastCalledWith(undefined, 'করিম');
  });
});
