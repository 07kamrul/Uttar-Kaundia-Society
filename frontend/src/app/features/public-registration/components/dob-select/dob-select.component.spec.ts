import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';
import bn from '../../../../../../public/i18n/bn.json';
import { DobSelectComponent } from './dob-select.component';

describe('DobSelectComponent (দিন / মাস / বছর)', () => {
  function create(value = '', max = '2026-10-13'): ComponentFixture<DobSelectComponent> {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('bn', bn);
    translate.use('bn');
    const fixture = TestBed.createComponent(DobSelectComponent);
    fixture.componentRef.setInput('value', value);
    fixture.componentRef.setInput('max', max);
    fixture.detectChanges();
    return fixture;
  }

  function pick(fixture: ComponentFixture<DobSelectComponent>, part: 'day' | 'month' | 'year', value: string): void {
    const select = fixture.nativeElement.querySelector(`[data-testid="dob-${part}"]`) as HTMLSelectElement;
    select.value = value;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  it('shows three labelled selects with Bangla month names', () => {
    const root = create().nativeElement as HTMLElement;
    const text = root.textContent ?? '';
    for (const word of ['দিন', 'মাস', 'বছর', 'জানুয়ারি', 'ডিসেম্বর']) expect(text).toContain(word);
    expect(root.querySelectorAll('select').length).toBe(3);
  });

  it('emits an ISO date once all three parts are chosen', () => {
    const fixture = create();
    const emitted: string[] = [];
    fixture.componentInstance.valueChange.subscribe((v) => emitted.push(v));
    pick(fixture, 'day', '3');
    pick(fixture, 'month', '2');
    expect(emitted.at(-1)).toBe('');
    pick(fixture, 'year', '1990');
    expect(emitted.at(-1)).toBe('1990-02-03');
  });

  it('preselects the parts of an existing value', () => {
    const fixture = create('1985-12-25');
    const get = (part: string) =>
      (fixture.nativeElement.querySelector(`[data-testid="dob-${part}"]`) as HTMLSelectElement).value;
    expect([get('day'), get('month'), get('year')]).toEqual(['25', '12', '1985']);
  });

  it('refuses an impossible date such as 31 February', () => {
    const fixture = create();
    const emitted: string[] = [];
    fixture.componentInstance.valueChange.subscribe((v) => emitted.push(v));
    pick(fixture, 'day', '31');
    pick(fixture, 'month', '2');
    pick(fixture, 'year', '1990');
    expect(emitted.at(-1)).toBe('');
  });

  it('refuses a date after max', () => {
    const fixture = create('', '2026-10-13');
    const emitted: string[] = [];
    fixture.componentInstance.valueChange.subscribe((v) => emitted.push(v));
    pick(fixture, 'day', '20');
    pick(fixture, 'month', '10');
    pick(fixture, 'year', '2026');
    expect(emitted.at(-1)).toBe('');
  });

  it('keeps every select at least 48px tall via the tap-48 class', () => {
    const root = create().nativeElement as HTMLElement;
    root.querySelectorAll('select').forEach((s) => expect(s.classList.contains('tap-48')).toBe(true));
  });
});
