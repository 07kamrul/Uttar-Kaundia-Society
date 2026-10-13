import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../../public/i18n/bn.json';
import { LanguageService } from '../../core/services/language.service';
import { LangSwitchComponent } from './lang-switch.component';

function create(current: 'bn' | 'en') {
  const lang = signal<'bn' | 'en'>(current);
  const setLang = vi.fn((next: 'bn' | 'en') => lang.set(next));
  TestBed.configureTestingModule({
    providers: [provideTranslateService(), { provide: LanguageService, useValue: { lang, setLang } }],
  });
  const t = TestBed.inject(TranslateService);
  t.setTranslation('bn', bn);
  t.use('bn');
  const f = TestBed.createComponent(LangSwitchComponent);
  f.detectChanges();
  return { f, setLang };
}

const btn = (f: { nativeElement: HTMLElement }, id: string) => f.nativeElement.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement;

describe('LangSwitchComponent', () => {
  it('shows বাংলা | English as two buttons with aria-pressed on the current language', () => {
    const { f } = create('bn');
    expect(btn(f, 'lang-bn').textContent?.trim()).toBe('বাংলা');
    expect(btn(f, 'lang-en').textContent?.trim()).toBe('English');
    expect(btn(f, 'lang-bn').getAttribute('aria-pressed')).toBe('true');
    expect(btn(f, 'lang-en').getAttribute('aria-pressed')).toBe('false');
  });

  it('switches the language on click and updates the pressed state', () => {
    const { f, setLang } = create('bn');
    btn(f, 'lang-en').click();
    f.detectChanges();
    expect(setLang).toHaveBeenCalledWith('en');
    expect(btn(f, 'lang-en').getAttribute('aria-pressed')).toBe('true');
    expect(btn(f, 'lang-bn').getAttribute('aria-pressed')).toBe('false');
  });

  it('does not call setLang when the current language is tapped again', () => {
    const { f, setLang } = create('bn');
    btn(f, 'lang-bn').click();
    expect(setLang).not.toHaveBeenCalled();
  });
});
