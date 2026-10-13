import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';
import bn from '../../../../public/i18n/bn.json';
import { FeatureFlagService } from '../../core/services/feature-flag.service';
import { LanguageService } from '../../core/services/language.service';
import { ThemeService } from '../../core/services/theme.service';
import { PublicShellComponent } from './public-shell.component';

function create(fiveAreas: boolean) {
  TestBed.configureTestingModule({
    providers: [
      provideTranslateService(),
      provideRouter([]),
      { provide: FeatureFlagService, useValue: { isEnabled: (k: string) => fiveAreas && k === 'nav_five_areas' } },
      { provide: LanguageService, useValue: { lang: signal('bn'), toggle: () => undefined, setLang: () => undefined } },
      { provide: ThemeService, useValue: { theme: signal('light'), toggle: () => undefined } },
    ],
  });
  const t = TestBed.inject(TranslateService);
  t.setTranslation('bn', bn);
  t.use('bn');
  const f = TestBed.createComponent(PublicShellComponent);
  f.detectChanges();
  return f.nativeElement as HTMLElement;
}

describe('PublicShellComponent language control', () => {
  it('keeps the single EN toggle while nav_five_areas is off', () => {
    const el = create(false);
    expect(el.querySelector('app-lang-switch')).toBeNull();
    expect(el.textContent).toContain('EN');
  });

  it('shows the বাংলা | English switch when nav_five_areas is on, and keeps the theme button', () => {
    const el = create(true);
    expect(el.querySelector('app-lang-switch')).not.toBeNull();
    expect(el.textContent).not.toMatch(/\bEN\b/);
    expect(el.querySelector('[aria-label="গাঢ় থিম"]')).not.toBeNull();
  });
});
