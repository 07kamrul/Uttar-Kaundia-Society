import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';
import bn from '../../../../../../../public/i18n/bn.json';
import { MapLegendCardComponent } from './map-legend-card.component';

function setup(inputs: { wizard?: boolean; rsOverlay?: boolean } = {}) {
  TestBed.configureTestingModule({
    imports: [MapLegendCardComponent],
    providers: [provideTranslateService()],
  });
  const t = TestBed.inject(TranslateService);
  t.setTranslation('bn', bn);
  t.use('bn');
  const fixture = TestBed.createComponent(MapLegendCardComponent);
  fixture.componentRef.setInput('statusItems', [
    { status: 'approved', color: '#0a0' },
    { status: 'pending', color: '#c90' },
  ]);
  fixture.componentRef.setInput('wizard', inputs.wizard ?? false);
  fixture.componentRef.setInput('rsOverlay', inputs.rsOverlay ?? false);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const toggle = el.querySelector('.legend-toggle') as HTMLButtonElement;
  if (toggle.getAttribute('aria-expanded') !== 'true') {
    toggle.click();
    fixture.detectChanges();
  }
  return { fixture, el, toggle };
}

describe('MapLegendCardComponent', () => {
  it('lists one chip per status item', () => {
    const { el } = setup();
    expect(el.querySelectorAll('.legend-chip').length).toBe(2);
  });

  it('adds the RS chip only when the overlay is on', () => {
    expect(setup({ rsOverlay: true }).el.querySelector('.legend-swatch-rs')).not.toBeNull();
  });

  it('shows the wizard legend instead of status chips in wizard mode', () => {
    const { el } = setup({ wizard: true });
    expect(el.querySelectorAll('.legend-chip').length).toBe(3);
  });

  it('collapses the body and updates aria-expanded when toggled', () => {
    const { fixture, el, toggle } = setup();
    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('.legend-body')).toBeNull();
  });
});
