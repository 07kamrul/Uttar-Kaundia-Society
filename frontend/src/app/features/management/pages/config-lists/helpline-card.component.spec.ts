import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../../../../public/i18n/bn.json';
import { HelplineService, type Helpline } from '../../../../core/services/helpline.service';
import { HelplineCardComponent } from './helpline-card.component';

const EMPTY: Helpline = { phone: null, whatsapp: null, hoursText: null, enabled: false };

function create(save = vi.fn((_i: unknown) => of(EMPTY)), current: Helpline = EMPTY) {
  TestBed.configureTestingModule({
    providers: [
      provideTranslateService(),
      { provide: HelplineService, useValue: { loadForAdmin: () => of(current), save } },
    ],
  });
  const t = TestBed.inject(TranslateService);
  t.setTranslation('bn', bn);
  t.use('bn');
  const f = TestBed.createComponent(HelplineCardComponent);
  f.detectChanges();
  return { f, save };
}

const q = (f: { nativeElement: HTMLElement }, sel: string) => f.nativeElement.querySelector(sel) as HTMLElement | null;

function type(f: { nativeElement: HTMLElement; detectChanges(): void }, sel: string, value: string) {
  const el = q(f, sel) as HTMLInputElement;
  el.value = value;
  el.dispatchEvent(new Event('input'));
  f.detectChanges();
}

describe('HelplineCardComponent', () => {
  it('shows the হেল্পলাইন card with the current numbers', () => {
    const { f } = create(undefined, { phone: '+8801711000000', whatsapp: null, hoursText: 'সকাল ৯টা', enabled: true });
    expect(q(f, '[data-testid="helpline-card"]')?.textContent).toContain('হেল্পলাইন');
    expect((q(f, '[data-testid="helpline-phone"]') as HTMLInputElement).value).toBe('+8801711000000');
    expect((q(f, '[data-testid="helpline-hours"]') as HTMLInputElement).value).toBe('সকাল ৯টা');
  });

  it('saves the typed values and confirms', () => {
    const { f, save } = create();
    type(f, '[data-testid="helpline-phone"]', '০১৭১১০০০০০০');
    type(f, '[data-testid="helpline-whatsapp"]', '');
    (q(f, '[data-testid="helpline-save"]') as HTMLButtonElement).click();
    f.detectChanges();
    expect(save).toHaveBeenCalledWith({ phone: '০১৭১১০০০০০০', whatsapp: '', hoursText: '' });
    expect(q(f, '[data-testid="helpline-saved"]')?.textContent).toContain('সংরক্ষিত হয়েছে');
  });

  it('explains an invalid number by its code, never the server text', () => {
    const save = vi.fn((_i: unknown) =>
      throwError(
        () => new HttpErrorResponse({ status: 422, error: { detail: { code: 'INVALID_BD_MOBILE', message: 'raw english' } } }),
      ),
    );
    const { f } = create(save);
    type(f, '[data-testid="helpline-phone"]', '123');
    (q(f, '[data-testid="helpline-save"]') as HTMLButtonElement).click();
    f.detectChanges();
    const err = q(f, '[data-testid="helpline-error"]')?.textContent ?? '';
    expect(err).toContain('মোবাইল নম্বরটি ঠিক নয়');
    expect(err).not.toContain('raw english');
  });
});
