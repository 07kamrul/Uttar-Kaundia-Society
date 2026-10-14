import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../../../../public/i18n/bn.json';
import { AuthService } from '../../../../core/services/auth.service';
import { FeatureFlagService } from '../../../../core/services/feature-flag.service';
import { MemberService } from '../../../../core/services/member.service';
import { ChangePasswordComponent } from './change-password.component';

class MemoryStorage {
  private readonly entries = new Map<string, string>();
  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.entries.set(key, String(value));
  }
}

describe('ChangePasswordComponent (password_policy_v2)', () => {
  const changePassword = vi.fn();

  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });
  });

  function setup(flags: string[]) {
    changePassword.mockReset();
    TestBed.configureTestingModule({
      imports: [ChangePasswordComponent],
      providers: [
        provideTranslateService(),
        { provide: MemberService, useValue: { changePassword } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: AuthService, useValue: { markPasswordChanged: vi.fn() } },
        { provide: FeatureFlagService, useValue: { isEnabled: (k: string) => flags.includes(k) } },
      ],
    });
    const t = TestBed.inject(TranslateService);
    t.setTranslation('bn', bn);
    t.use('bn');
    const fixture = TestBed.createComponent(ChangePasswordComponent);
    fixture.detectChanges();
    return { c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  function fill(c: ChangePasswordComponent, current: string, next: string, confirm: string): void {
    c.form.setValue({ currentPassword: current, newPassword: next, confirmPassword: confirm });
  }

  it('v1 keeps the digit rule: a 10-letter password without a digit is blocked client-side', () => {
    const { c } = setup([]);
    fill(c, 'oldpass123', 'abcdefghij', 'abcdefghij');
    c.onSubmit();
    expect(c.form.invalid).toBe(true);
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('v2 is length-only: a 10-letter password without a digit is sent', () => {
    const { c } = setup(['password_policy_v2']);
    changePassword.mockReturnValue(of(undefined));
    fill(c, 'oldpass123', 'abcdefghij', 'abcdefghij');
    c.onSubmit();
    expect(changePassword).toHaveBeenCalledWith('oldpass123', 'abcdefghij');
  });

  it('v2 still requires 8 characters', () => {
    const { c } = setup(['password_policy_v2']);
    fill(c, 'oldpass123', 'abc1', 'abc1');
    c.onSubmit();
    expect(c.form.invalid).toBe(true);
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('v2 shows the length-only hint text', () => {
    const v1 = setup([]);
    expect(v1.el.textContent).not.toContain(bn['member']['changePassword']['passwordHintV2']);
    const v2 = setup(['password_policy_v2']);
    expect(v2.el.textContent).toContain(bn['member']['changePassword']['passwordHintV2']);
  });

  it('v1 shows no hint', () => {
    const { el } = setup([]);
    expect(el.querySelector('.field-hint')).toBeNull();
  });

  it('maps 422 PASSWORD_TOO_COMMON to its own message on the new-password field', () => {
    const { c } = setup(['password_policy_v2']);
    changePassword.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 422, error: { detail: { code: 'PASSWORD_TOO_COMMON', message: 'server words' } } })),
    );
    fill(c, 'oldpass123', '12345678', '12345678');
    c.onSubmit();
    expect(c.serverErrors['newPassword']).toBe(bn['errors']['code']['PASSWORD_TOO_COMMON']);
    expect(c.error).toBe('');
  });

  it('maps 422 PASSWORD_TOO_SAME_AS_CURRENT and PASSWORD_TOO_WEAK to their messages', () => {
    const same = setup(['password_policy_v2']);
    changePassword.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 422, error: { detail: { code: 'PASSWORD_SAME_AS_CURRENT' } } })),
    );
    fill(same.c, 'oldpass123', 'different1', 'different1');
    same.c.onSubmit();
    expect(same.c.serverErrors['newPassword']).toBe(bn['errors']['code']['PASSWORD_SAME_AS_CURRENT']);

    const weak = setup(['password_policy_v2']);
    changePassword.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 422, error: { detail: { code: 'PASSWORD_TOO_WEAK' } } })),
    );
    fill(weak.c, 'oldpass123', 'different1', 'different1');
    weak.c.onSubmit();
    expect(weak.c.serverErrors['newPassword']).toBe(bn['errors']['code']['PASSWORD_TOO_WEAK']);
  });

  it('maps 422 PASSWORD_TOO_SHORT to its message when the server rejects a client-valid password', () => {
    const { c } = setup(['password_policy_v2']);
    changePassword.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 422, error: { detail: { code: 'PASSWORD_TOO_SHORT' } } })),
    );
    fill(c, 'oldpass123', 'abcdefghij', 'abcdefghij');
    c.onSubmit();
    expect(c.serverErrors['newPassword']).toBe(bn['errors']['code']['PASSWORD_TOO_SHORT']);
  });
});
