import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../../../../public/i18n/bn.json';
import { AuthService } from '../../../../core/services/auth.service';
import { FeatureFlagService } from '../../../../core/services/feature-flag.service';
import { LoginComponent } from './login.component';

/** AuthService stub whose login() fails with whatever the test pushes. */
class AuthStub {
  readonly login$ = new Subject<never>();
  login = vi.fn(() => this.login$.asObservable());
  fail(status: number, body: unknown): void {
    this.login$.error(new HttpErrorResponse({ status, error: body, url: '/api/login' }));
  }
}

function create(flags: string[]): { el: HTMLElement; fixture: any; auth: AuthStub } {
  const authStub = new AuthStub();
  TestBed.configureTestingModule({
    imports: [LoginComponent],
    providers: [
      provideTranslateService(),
      provideRouter([]),
      { provide: Router, useValue: { navigate: vi.fn(), navigateByUrl: vi.fn() } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } },
      { provide: AuthService, useValue: authStub },
      { provide: FeatureFlagService, useValue: { isEnabled: (k: string) => flags.includes(k) } },
    ],
  });
  const t = TestBed.inject(TranslateService);
  t.setTranslation('bn', bn);
  t.use('bn');
  const fixture = TestBed.createComponent(LoginComponent);
  fixture.detectChanges();
  return { el: fixture.nativeElement as HTMLElement, fixture, auth: authStub };
}

function submit(fixture: any): void {
  fixture.componentInstance.form.patchValue({ identifier: '01712345678', password: 'pw' });
  fixture.componentInstance.onSubmit();
}

describe('LoginComponent (login_by_phone)', () => {
  it('keeps the old label and no helper while the flag is off', () => {
    const { el } = create([]);
    const labels = [...el.querySelectorAll('label')].map((l) => l.textContent?.trim());
    expect(labels[0]).toBe(bn['auth']['login']['identifierLabel']);
    expect(el.querySelector('[data-testid="login-helper"]')).toBeNull();
  });

  it('uses the mobile/email/member-ID label and shows the helper with the flag on', () => {
    const { el } = create(['login_by_phone']);
    const labels = [...el.querySelectorAll('label')].map((l) => l.textContent?.trim());
    expect(labels[0]).toBe(bn['auth']['login']['identifierLabelV2']);
    const helper = el.querySelector('[data-testid="login-helper"]');
    expect(helper?.textContent).toContain(bn['auth']['login']['identifierHelper']);
  });

  it('maps a 401 to the plain invalid-credentials message', () => {
    const { fixture, auth } = create(['login_by_phone']);
    submit(fixture);
    auth.fail(401, { detail: { message: 'Invalid credentials' } });
    fixture.detectChanges();
    expect(fixture.componentInstance.error).toBe(bn['auth']['login']['errorInvalidV2']);
  });

  it('maps 409 LOGIN_AMBIGUOUS_IDENTIFIER to the use-email-or-member-ID message, never the server text', () => {
    const { fixture, auth } = create(['login_by_phone']);
    submit(fixture);
    auth.fail(409, { detail: { code: 'LOGIN_AMBIGUOUS_IDENTIFIER', message: 'internal wording' } });
    fixture.detectChanges();
    expect(fixture.componentInstance.error).toBe(bn['errors']['code']['LOGIN_AMBIGUOUS_IDENTIFIER']);
    expect(fixture.componentInstance.error).not.toContain('internal');
  });

  it('maps 429 to the try-again-in-15-minutes message', () => {
    const { fixture, auth } = create(['login_by_phone']);
    submit(fixture);
    auth.fail(429, { detail: { message: 'Too many attempts' } });
    fixture.detectChanges();
    expect(fixture.componentInstance.error).toBe(bn['auth']['login']['errorRateLimited']);
  });

  it('keeps today\'s single message for every failure while the flag is off', () => {
    const { fixture, auth } = create([]);
    submit(fixture);
    auth.fail(429, { detail: { message: 'x' } });
    fixture.detectChanges();
    expect(fixture.componentInstance.error).toBe(bn['auth']['login']['loginFailedError']);
  });
});
