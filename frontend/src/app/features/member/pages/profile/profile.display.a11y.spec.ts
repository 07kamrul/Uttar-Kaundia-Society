import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../../../../public/i18n/bn.json';
import { AuthService } from '../../../../core/services/auth.service';
import { DataSaverService } from '../../../../core/services/data-saver.service';
import { FeatureFlagService } from '../../../../core/services/feature-flag.service';
import { MemberService, type MemberProfile } from '../../../../core/services/member.service';
import { TextSizeService } from '../../../../core/services/text-size.service';
import { ThemeService } from '../../../../core/services/theme.service';
import { ProfileComponent } from './profile.component';

class MemoryStorage {
  private readonly entries = new Map<string, string>();
  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.entries.set(key, String(value));
  }
}

const PROFILE = {
  memberId: 'UKAMKS-1',
  status: 'approved',
  fullName: 'Test',
  fatherOrHusband: 'F',
  mother: 'M',
  dob: '2000-01-01',
  mobile: '+8801712345678',
  showInNeighbourDirectory: true,
  properties: [],
  nominees: [],
} as MemberProfile;

function create(extraFlags: string[]) {
  // The switches live inside the nav_five_areas "প্রদর্শন" card.
  const flags = ['nav_five_areas', ...extraFlags];
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
  document.documentElement.classList.remove('text-lg');
  TestBed.configureTestingModule({
    imports: [ProfileComponent],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideTranslateService(),
      { provide: MemberService, useValue: { getProfile: () => of(PROFILE), getPropertyRequests: () => of([]) } },
      { provide: FeatureFlagService, useValue: { isEnabled: (k: string) => flags.includes(k) } },
      { provide: ThemeService, useValue: { theme: signal('light'), toggle: vi.fn() } },
      { provide: AuthService, useValue: { role: 'member', hasAnyPermission: () => true, hasPermission: () => true } },
      DataSaverService,
      TextSizeService,
    ],
  });
  const t = TestBed.inject(TranslateService);
  t.setTranslation('bn', bn);
  t.use('bn');
  const f = TestBed.createComponent(ProfileComponent);
  f.detectChanges();
  return { el: f.nativeElement as HTMLElement, f };
}

describe('ProfileComponent display switches (ui_a11y_v2 / data_saver)', () => {
  it('has no text-size or data-saver switch while both flags are off', () => {
    const { el } = create([]);
    expect(el.querySelector('[data-testid="text-size-toggle"]')).toBeNull();
    expect(el.querySelector('[data-testid="data-saver-toggle"]')).toBeNull();
  });

  it('shows "লেখা বড় করুন" when ui_a11y_v2 is on and it applies html.text-lg', () => {
    const { el, f } = create(['ui_a11y_v2']);
    const card = el.querySelector('[data-testid="display-card"]') as HTMLElement;
    expect(card.textContent).toContain('লেখা বড় করুন');
    const toggle = card.querySelector('[data-testid="text-size-toggle"] input') as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    toggle.click();
    f.detectChanges();
    expect(toggle.checked).toBe(true);
    expect(document.documentElement.classList.contains('text-lg')).toBe(true);
  });

  it('shows "ডেটা সাশ্রয়" when data_saver is on and it persists the choice', () => {
    const { el, f } = create(['data_saver']);
    const card = el.querySelector('[data-testid="display-card"]') as HTMLElement;
    expect(card.textContent).toContain('ডেটা সাশ্রয়');
    const toggle = card.querySelector('[data-testid="data-saver-toggle"] input') as HTMLInputElement;
    toggle.click();
    f.detectChanges();
    expect(toggle.checked).toBe(true);
    expect(globalThis.localStorage.getItem('krmf_data_saver')).toBe('1');
  });
});
