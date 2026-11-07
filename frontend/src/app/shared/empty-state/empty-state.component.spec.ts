import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';
import bn from '../../../../public/i18n/bn.json';
import type { IconName } from '../icon/icon.component';
import { EmptyStateComponent } from './empty-state.component';

@Component({
  imports: [EmptyStateComponent],
  template: `<app-empty-state [icon]="icon()" [titleKey]="titleKey()" [hintKey]="hintKey()" />`,
})
class Host {
  readonly icon = signal<IconName | null>(null);
  readonly titleKey = signal('common.retry');
  readonly hintKey = signal<string | null>(null);
}

function setup(patch: Partial<{ icon: IconName | null; hintKey: string | null }> = {}) {
  TestBed.configureTestingModule({ imports: [Host], providers: [provideTranslateService()] });
  const t = TestBed.inject(TranslateService);
  t.setTranslation('bn', bn);
  t.use('bn');
  const fixture = TestBed.createComponent(Host);
  if (patch.icon !== undefined) fixture.componentInstance.icon.set(patch.icon);
  if (patch.hintKey !== undefined) fixture.componentInstance.hintKey.set(patch.hintKey);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('EmptyStateComponent', () => {
  it('renders the translated title as a polite status', () => {
    const el = setup();
    expect(el.querySelector('.empty-state-title')?.textContent).toContain('আবার চেষ্টা করুন');
    expect(el.querySelector('[role="status"]')).not.toBeNull();
  });

  it('omits icon and hint when not provided', () => {
    const el = setup();
    expect(el.querySelector('.empty-state-badge')).toBeNull();
    expect(el.querySelector('.empty-state-hint')).toBeNull();
  });

  it('renders a decorative icon and the hint when provided', () => {
    const el = setup({ icon: 'doc', hintKey: 'common.retry' });
    const badge = el.querySelector('.empty-state-badge');
    expect(badge?.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('.empty-state-hint')?.textContent).toContain('আবার চেষ্টা করুন');
  });
});
