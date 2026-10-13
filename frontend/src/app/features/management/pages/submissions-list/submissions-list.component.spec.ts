import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import bn from '../../../../../../public/i18n/bn.json';
import type { SubmissionSummary } from '../../../../core/models/admin.model';
import { AdminService } from '../../../../core/services/admin.service';
import { SubmissionsListComponent } from './submissions-list.component';

const row = (id: string, needsDag: boolean): SubmissionSummary => ({
  id,
  fullName: `সদস্য ${id}`,
  mobile: '01711111111',
  status: 'pending',
  createdAt: '2026-01-01T00:00:00Z',
  needsDag,
});

describe('SubmissionsListComponent', () => {
  it('shows "দাগ দরকার" only on the rows that need a dag', () => {
    TestBed.configureTestingModule({
      imports: [SubmissionsListComponent],
      providers: [
        provideRouter([]),
        provideTranslateService(),
        { provide: AdminService, useValue: { listSubmissions: () => of([row('1', true), row('2', false)]) } },
      ],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('bn', bn);
    translate.use('bn');
    const fixture = TestBed.createComponent(SubmissionsListComponent);
    fixture.detectChanges();
    fixture.detectChanges();
    const rows = fixture.nativeElement.querySelectorAll('tbody tr') as NodeListOf<HTMLElement>;
    expect(rows[0].querySelector('[data-testid="needs-dag-badge"]')!.textContent).toContain('দাগ দরকার');
    expect(rows[1].querySelector('[data-testid="needs-dag-badge"]')).toBeNull();
  });
});
