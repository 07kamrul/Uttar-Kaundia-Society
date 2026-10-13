import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';
import bn from '../../../../../../public/i18n/bn.json';
import en from '../../../../../../public/i18n/en.json';
import { PayTitlePipe } from './pay-title.pipe';

function pipe(lang: 'bn' | 'en'): PayTitlePipe {
  TestBed.configureTestingModule({ providers: [provideTranslateService(), PayTitlePipe] });
  const t = TestBed.inject(TranslateService);
  t.setTranslation('bn', bn);
  t.setTranslation('en', en);
  t.use(lang);
  return TestBed.inject(PayTitlePipe);
}

describe('PayTitlePipe', () => {
  it('turns the server installment title "কিস্তি 03/2026" into month name and year in Bangla', () => {
    const text = pipe('bn').transform('কিস্তি 03/2026', 'installment');
    expect(text).toContain('মার্চ');
    expect(text).toContain('২০২৬');
    expect(text).not.toContain('03');
  });

  it('uses English month names in English mode', () => {
    expect(pipe('en').transform('কিস্তি 11/2026', 'installment')).toBe('November 2026');
  });

  it('falls back to the server title when it does not match or is not an installment', () => {
    const p = pipe('bn');
    expect(p.transform('মসজিদ মেরামত', 'cost_share')).toBe('মসজিদ মেরামত');
    expect(p.transform('কিস্তি 13/2026', 'installment')).toBe('কিস্তি 13/2026');
    expect(p.transform('জানুয়ারি ২০২৬', 'installment')).toBe('জানুয়ারি ২০২৬');
  });
});
