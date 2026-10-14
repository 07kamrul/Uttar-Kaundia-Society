import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ConfigListService } from '../../core/services/config-list.service';
import { FALLBACK_REASONS, REASON_CATEGORY } from './reject-reasons';
import { ReasonPickerComponent } from './reason-picker.component';

@Component({
  standalone: true,
  imports: [ReasonPickerComponent],
  template: `<app-reason-picker [category]="category" [(value)]="reason" />`,
})
class Host {
  category = REASON_CATEGORY.payment;
  reason = signal('');
}

function item(value: string) {
  return { id: value, category: 'x', value, label: value, sortOrder: 1, isActive: true };
}

function setup(items$: ReturnType<ConfigListService['getItems']>) {
  const getItems = vi.fn(() => items$);
  TestBed.configureTestingModule({
    imports: [Host],
    providers: [provideTranslateService(), { provide: ConfigListService, useValue: { getItems } }],
  });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const chips = () => [...el.querySelectorAll<HTMLButtonElement>('[data-testid="reason-chip"]')];
  const area = () => el.querySelector('textarea') as HTMLTextAreaElement;
  return { fixture, getItems, chips, area };
}

describe('ReasonPickerComponent', () => {
  it('shows the config-list reasons as chips and asks for the right category', () => {
    const { getItems, chips } = setup(of([item('TrxID মিলছে না'), item('ডুপ্লিকেট পেমেন্ট')]));
    expect(getItems).toHaveBeenCalledWith('reject_reason_payment');
    expect(chips().map((c) => c.textContent?.trim())).toEqual(['TrxID মিলছে না', 'ডুপ্লিকেট পেমেন্ট']);
  });

  it('a chip fills the textarea, which stays editable and feeds the parent value', () => {
    const { fixture, chips, area } = setup(of([item('স্ক্রিনশট অস্পষ্ট')]));
    chips()[0].click();
    fixture.detectChanges();
    expect(area().value).toBe('স্ক্রিনশট অস্পষ্ট');
    expect(fixture.componentInstance.reason()).toBe('স্ক্রিনশট অস্পষ্ট');

    area().value = 'স্ক্রিনশট অস্পষ্ট, আবার পাঠান';
    area().dispatchEvent(new Event('input'));
    expect(fixture.componentInstance.reason()).toBe('স্ক্রিনশট অস্পষ্ট, আবার পাঠান');
  });

  it('falls back to the built-in reasons when the list is empty', () => {
    const { chips } = setup(of([]));
    expect(chips().map((c) => c.textContent?.trim())).toEqual([...FALLBACK_REASONS[REASON_CATEGORY.payment]]);
  });

  it('falls back to the built-in reasons when loading fails', () => {
    const { chips } = setup(throwError(() => new Error('x')));
    expect(chips().length).toBe(FALLBACK_REASONS[REASON_CATEGORY.payment].length);
  });

  it('has four categories with built-in reasons', () => {
    expect(Object.values(REASON_CATEGORY).sort()).toEqual([
      'reject_reason_application',
      'reject_reason_boundary',
      'reject_reason_payment',
      'reject_reason_property_request',
    ]);
    for (const category of Object.values(REASON_CATEGORY)) expect(FALLBACK_REASONS[category].length).toBeGreaterThan(0);
  });
});
