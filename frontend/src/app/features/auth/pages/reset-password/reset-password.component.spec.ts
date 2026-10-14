import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../../../../public/i18n/bn.json';
import { AuthService } from '../../../../core/services/auth.service';
import { FeatureFlagService } from '../../../../core/services/feature-flag.service';
import { ResetPasswordComponent } from './reset-password.component';

describe('ResetPasswordComponent (password_policy_v2)', () => {
  const resetPassword = vi.fn();

  function setup(flags: string[], token = 'tok-1') {
    resetPassword.mockReset();
    TestBed.configureTestingModule({
      imports: [ResetPasswordComponent],
      providers: [
        provideTranslateService(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: (k: string) => (k === 'token' ? token : null) } } } },
        { provide: AuthService, useValue: { resetPassword } },
        { provide: FeatureFlagService, useValue: { isEnabled: (k: string) => flags.includes(k) } },
      ],
    });
    const t = TestBed.inject(TranslateService);
    t.setTranslation('bn', bn);
    t.use('bn');
    const fixture = TestBed.createComponent(ResetPasswordComponent);
    fixture.detectChanges();
    return { c: fixture.componentInstance, fixture, el: fixture.nativeElement as HTMLElement };
  }

  function fill(c: { form: any }, next: string, confirm = next): void {
    c.form.setValue({ newPassword: next, confirmPassword: confirm });
  }

  it('v1 keeps the old behaviour: no client policy check, any password is sent', () => {
    const { c } = setup([]);
    resetPassword.mockReturnValue(of(undefined));
    fill(c, 'abcdefghij');
    c.onSubmit();
    expect(resetPassword).toHaveBeenCalledWith('tok-1', 'abcdefghij');
    expect(c.resetDone).toBe(true);
  });

  it('v1 shows the old digit hint when the server rejects a weak password', () => {
    const { c, el } = setup([]);
    resetPassword.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 422, error: { detail: { message: 'weak' } } })));
    fill(c, 'abcdefghij');
    c.onSubmit();
    expect(c.error).toBe(bn['auth']['resetPassword']['weakPasswordError']);
    expect(el.textContent).not.toContain(bn['auth']['resetPassword']['passwordHintV2']);
  });

  it('v2 is length-only: the same 10-letter password is sent', () => {
    const { c } = setup(['password_policy_v2']);
    resetPassword.mockReturnValue(of(undefined));
    fill(c, 'abcdefghij');
    c.onSubmit();
    expect(resetPassword).toHaveBeenCalledWith('tok-1', 'abcdefghij');
  });

  it('v2 still requires 8 characters', () => {
    const { c } = setup(['password_policy_v2']);
    fill(c, 'abc1');
    c.onSubmit();
    expect(c.form.invalid).toBe(true);
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('shows the length-only hint once the field is touched with the flag on', () => {
    const { c, fixture, el } = setup(['password_policy_v2']);
    fill(c, 'abc1', 'abc2');
    c.form.get('newPassword')!.markAsTouched();
    c.onSubmit();
    fixture.detectChanges();
    expect(el.textContent).toContain(bn['auth']['resetPassword']['passwordHintV2']);
  });

  it('maps 422 PASSWORD_TOO_COMMON to its own message, never the server text', () => {
    const { c, el } = setup(['password_policy_v2']);
    resetPassword.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 422, error: { detail: { code: 'PASSWORD_TOO_COMMON', message: 'server words' } } })),
    );
    fill(c, 'abcdefghij');
    c.onSubmit();
    expect(c.error).toBe(bn['errors']['code']['PASSWORD_TOO_COMMON']);
    expect(el.textContent).not.toContain('server words');
  });

  it('keeps the invalid-token message for a 400', () => {
    const { c } = setup(['password_policy_v2']);
    resetPassword.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400 })));
    fill(c, 'abcdefghij');
    c.onSubmit();
    expect(c.error).toBe(bn['auth']['resetPassword']['invalidTokenError']);
  });
});
