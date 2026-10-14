import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../../../../public/i18n/bn.json';
import { PhoneFixService, type PhoneFix } from '../../../../core/services/phone-fix.service';
import { PhoneFixesComponent } from './phone-fixes.component';

const fix = (id: number, raw: string): PhoneFix => ({
  id,
  entityType: 'member',
  field: 'mobile',
  rawValue: raw,
  memberCode: `UKAMKS-${id}`,
  memberName: `সদস্য ${id}`,
});

function setup(rows: PhoneFix[], resolve = vi.fn(() => of({}))) {
  const list = vi.fn(() => of(rows));
  TestBed.configureTestingModule({
    imports: [PhoneFixesComponent],
    providers: [provideTranslateService(), { provide: PhoneFixService, useValue: { list, resolve } }],
  });
  const t = TestBed.inject(TranslateService);
  t.setTranslation('bn', bn);
  t.use('bn');
  const fixture = TestBed.createComponent(PhoneFixesComponent);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const type = (row: number, value: string) => {
    const input = el.querySelectorAll<HTMLInputElement>('[data-testid="fix-row"] input[type="tel"]')[row];
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const save = (row: number) => el.querySelectorAll<HTMLButtonElement>('[data-testid="fix-save"]')[row];
  return { fixture, el, list, resolve, type, save };
}

describe('PhoneFixesComponent', () => {
  it('lists each open fix with the member, the field in Bangla and the raw value', () => {
    const { el } = setup([fix(3, '01-7')]);
    const row = el.querySelector('[data-testid="fix-row"]') as HTMLElement;
    expect(row.textContent).toContain('সদস্য 3');
    expect(row.textContent).toContain('UKAMKS-3');
    expect(row.textContent).toContain('মোবাইল');
    expect(row.textContent).toContain('01-7');
  });

  it('keeps save disabled until a valid number is typed, then PUTs the E.164 number and drops the row', () => {
    const { fixture, el, resolve, type, save } = setup([fix(3, '01-7'), fix(4, 'abc')]);
    expect(save(0).disabled).toBe(true);
    type(0, '01712345678');
    expect(save(0).disabled).toBe(false);
    save(0).click();
    fixture.detectChanges();
    expect(resolve).toHaveBeenCalledWith(3, '+8801712345678');
    expect(el.querySelectorAll('[data-testid="fix-row"]').length).toBe(1);
  });

  it('maps the server code through the user-error messages and keeps the row', () => {
    const resolve = vi.fn(() =>
      throwError(() => new HttpErrorResponse({ status: 409, error: { detail: { success: false, code: 'PHONE_DUPLICATE', message: 'raw' } } })),
    );
    const { fixture, el, type, save } = setup([fix(3, '01-7')], resolve);
    type(0, '01712345678');
    save(0).click();
    fixture.detectChanges();
    const error = el.querySelector('[data-testid="fix-error"]') as HTMLElement;
    expect(error.textContent).toContain(bn.errors.code.PHONE_DUPLICATE);
    expect(error.textContent).not.toContain('raw');
    expect(el.querySelectorAll('[data-testid="fix-row"]').length).toBe(1);
  });

  it('shows an empty message when nothing needs fixing', () => {
    const { el } = setup([]);
    expect(el.querySelector('[data-testid="fix-empty"]')).not.toBeNull();
  });
});
