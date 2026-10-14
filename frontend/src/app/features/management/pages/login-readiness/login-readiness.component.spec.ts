import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../../../../public/i18n/bn.json';
import { LoginReadinessService, type LoginReadiness } from '../../../../core/services/login-readiness.service';
import { LoginReadinessComponent } from './login-readiness.component';

const REPORT: LoginReadiness = {
  loginByPhoneEnabled: false,
  membersWithLogin: 412,
  duplicateMobileGroups: [
    {
      mobile: '+8801712345678',
      members: [
        { id: 7, memberId: 'UKAMKS-7', fullName: 'রহিম', status: 'approved', hasLogin: true },
        { id: 8, memberId: 'UKAMKS-8', fullName: 'করিম', status: 'approved', hasLogin: true },
      ],
    },
  ],
  duplicateGroupCount: 1,
  unparseableMobiles: [{ id: 9, memberId: 'UKAMKS-9', raw: '01-7' }],
  openPhoneFixes: 3,
  duplicateEmailGroups: [],
};

function setup(report$ = of(REPORT)) {
  const report = vi.fn(() => report$);
  TestBed.configureTestingModule({
    imports: [LoginReadinessComponent],
    providers: [provideTranslateService(), provideRouter([]), { provide: LoginReadinessService, useValue: { report } }],
  });
  const t = TestBed.inject(TranslateService);
  t.setTranslation('bn', bn);
  t.use('bn');
  const fixture = TestBed.createComponent(LoginReadinessComponent);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, report };
}

describe('LoginReadinessComponent', () => {
  it('shows the counts and the duplicate groups with their members', () => {
    const { el } = setup();
    const text = el.textContent ?? '';
    expect(text).toContain('৪১২');
    expect(text).toContain('+8801712345678');
    expect(text).toContain('UKAMKS-7');
    expect(text).toContain('UKAMKS-8');
    expect(text).toContain('01-7');
  });

  it('links the open phone fixes to /phone-fixes', () => {
    const { el } = setup();
    const link = el.querySelector('a[href="/phone-fixes"]');
    expect(link).not.toBeNull();
    expect(link?.textContent).toContain('৩');
  });

  it('is read-only: no form controls, only the refresh and retry buttons', () => {
    const { el } = setup();
    expect(el.querySelectorAll('input, select, textarea').length).toBe(0);
    expect(el.querySelectorAll('button').length).toBe(1);
  });

  it('says clearly when there is nothing to fix', () => {
    const { el } = setup(of({ ...REPORT, duplicateMobileGroups: [], duplicateGroupCount: 0, unparseableMobiles: [], openPhoneFixes: 0 }));
    expect(el.querySelector('[data-testid="readiness-clear"]')).not.toBeNull();
  });

  it('shows an error with retry when loading fails, and retries', () => {
    const { fixture, el, report } = setup(throwError(() => new Error('x')));
    expect(el.querySelector('[data-testid="readiness-error"]')).not.toBeNull();
    (el.querySelector('[data-testid="readiness-error"] button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(report).toHaveBeenCalledTimes(2);
  });
});
