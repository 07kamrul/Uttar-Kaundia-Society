import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../../public/i18n/bn.json';
import { HelplineService, type Helpline } from '../../core/services/helpline.service';
import { HelpFabComponent } from './help-fab.component';

function create(helpline: Helpline) {
  const ensureLoaded = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      provideTranslateService(),
      provideRouter([]),
      { provide: HelplineService, useValue: { helpline: signal(helpline).asReadonly(), ensureLoaded } },
    ],
  });
  const t = TestBed.inject(TranslateService);
  t.setTranslation('bn', bn);
  t.use('bn');
  const f = TestBed.createComponent(HelpFabComponent);
  f.detectChanges();
  return { f, ensureLoaded };
}

const q = (f: { nativeElement: HTMLElement }, sel: string) => f.nativeElement.querySelector(sel) as HTMLElement | null;

describe('HelpFabComponent', () => {
  it('asks for the helpline once on creation', () => {
    expect(create({ phone: null, whatsapp: null, hoursText: null, enabled: false }).ensureLoaded).toHaveBeenCalled();
  });

  it('renders nothing while the helpline is empty', () => {
    const { f } = create({ phone: null, whatsapp: null, hoursText: null, enabled: false });
    expect(q(f, '[data-testid="help-fab"]')).toBeNull();
  });

  it('shows "সাহায্য দরকার?" once a number is set and opens a sheet with call, WhatsApp and help desk', () => {
    const { f } = create({ phone: '+8801711000000', whatsapp: '+8801711000001', hoursText: 'সকাল ৯টা থেকে ৫টা', enabled: true });
    const fab = q(f, '[data-testid="help-fab"]') as HTMLElement;
    expect(fab.textContent).toContain('সাহায্য দরকার?');
    expect(q(f, '[data-testid="help-sheet"]')).toBeNull();
    fab.click();
    f.detectChanges();
    expect(q(f, '[data-testid="help-call"]')?.getAttribute('href')).toBe('tel:+8801711000000');
    expect(q(f, '[data-testid="help-whatsapp"]')?.getAttribute('href')).toBe('https://wa.me/8801711000001');
    expect(q(f, '[data-testid="help-desk"]')?.getAttribute('href')).toBe('/emergency-help');
    expect(q(f, '[data-testid="help-sheet"]')?.textContent).toContain('সকাল ৯টা থেকে ৫টা');
    expect(q(f, '[data-testid="help-sheet"]')?.textContent).toContain('ফোন করুন');
    expect(q(f, '[data-testid="help-sheet"]')?.textContent).toContain('হোয়াটসঅ্যাপ');
  });

  it('omits the call button when only WhatsApp is set', () => {
    const { f } = create({ phone: null, whatsapp: '+8801711000001', hoursText: null, enabled: true });
    (q(f, '[data-testid="help-fab"]') as HTMLElement).click();
    f.detectChanges();
    expect(q(f, '[data-testid="help-call"]')).toBeNull();
    expect(q(f, '[data-testid="help-whatsapp"]')).not.toBeNull();
  });

  it('closes the sheet with the close button', () => {
    const { f } = create({ phone: '+8801711000000', whatsapp: null, hoursText: null, enabled: true });
    (q(f, '[data-testid="help-fab"]') as HTMLElement).click();
    f.detectChanges();
    (q(f, '[data-testid="help-close"]') as HTMLElement).click();
    f.detectChanges();
    expect(q(f, '[data-testid="help-sheet"]')).toBeNull();
  });
});
