import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../../../../../public/i18n/bn.json';
import { LayersSheetComponent } from './layers-sheet.component';

function setup(inputs: { mode?: 'boundaries' | 'bds'; rs?: boolean; snap?: boolean; satellite?: boolean } = {}) {
  TestBed.configureTestingModule({
    imports: [LayersSheetComponent],
    providers: [provideTranslateService()],
  });
  const t = TestBed.inject(TranslateService);
  t.setTranslation('bn', bn);
  t.use('bn');
  const fixture = TestBed.createComponent(LayersSheetComponent);
  fixture.componentRef.setInput('mode', inputs.mode ?? 'boundaries');
  fixture.componentRef.setInput('rs', inputs.rs ?? false);
  fixture.componentRef.setInput('snap', inputs.snap ?? false);
  fixture.componentRef.setInput('satellite', inputs.satellite ?? false);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

const tid = (el: HTMLElement, id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

describe('LayersSheetComponent', () => {
  it('marks the active map type and emits modeChange from the segmented control', async () => {
    const { fixture, el } = setup({ mode: 'boundaries' });
    expect(tid(el, 'layer-mode-mine')?.getAttribute('aria-checked')).toBe('true');
    expect(tid(el, 'layer-mode-bds')?.getAttribute('aria-checked')).toBe('false');
    const emitted = vi.fn();
    fixture.componentInstance.modeChange.subscribe(emitted);
    tid(el, 'layer-mode-bds')!.click();
    expect(emitted).toHaveBeenCalledWith('bds');
  });

  it('positions itself from the anchor input as a dropdown', () => {
    const { fixture, el } = setup();
    expect(tid(el, 'layers-sheet')?.classList).not.toContain('anchored');
    fixture.componentRef.setInput('anchor', { top: 64, left: 120 });
    fixture.detectChanges();
    const sheet = tid(el, 'layers-sheet')!;
    expect(sheet.classList).toContain('anchored');
    expect(sheet.style.getPropertyValue('--anchor-top')).toBe('64px');
    expect(sheet.style.getPropertyValue('--anchor-left')).toBe('120px');
  });

  it('renders the switch rows with their translated labels', () => {
    const { el } = setup({ rs: true });
    expect(el.textContent).toContain('মানচিত্রের ধরন');
    expect(el.textContent).toContain('অতিরিক্ত স্তর');
    expect(el.textContent).toContain('রাজউক RS দাগ রেখা দেখান');
    expect(tid(el, 'layer-rs')?.getAttribute('aria-checked')).toBe('true');
    expect(tid(el, 'layer-satellite')).not.toBeNull();
  });

  it('disables snapping without RS lines and shows the helper hint', () => {
    const { el } = setup({ rs: false });
    const snap = tid(el, 'layer-snap') as HTMLButtonElement;
    expect(snap.disabled).toBe(true);
    expect(el.textContent).toContain('প্রথমে RS দাগ রেখা চালু করুন');
  });

  it('drops the satellite row when showSatellite is false', () => {
    const { fixture, el } = setup();
    fixture.componentRef.setInput('showSatellite', false);
    fixture.detectChanges();
    expect(tid(el, 'layer-satellite')).toBeNull();
  });

  it('closes on Escape, the backdrop and the header close button', async () => {
    const { fixture, el } = setup();
    const emitted = vi.fn();
    fixture.componentInstance.closed.subscribe(emitted);
    tid(el, 'layers-close')!.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    el.querySelector('.sheet-backdrop')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(emitted).toHaveBeenCalledTimes(3);
  });
});
