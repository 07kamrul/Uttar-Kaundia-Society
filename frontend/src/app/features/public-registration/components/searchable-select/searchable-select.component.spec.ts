import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';
import bn from '../../../../../../public/i18n/bn.json';
import { SearchableSelectComponent, type SelectOption } from './searchable-select.component';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, SearchableSelectComponent],
  template: `<app-searchable-select inputId="x" [options]="options" [formControl]="control" />`,
})
class HostComponent {
  control = new FormControl('');
  options: SelectOption[] = [
    { value: 'ঢাকা', label: 'ঢাকা' },
    { value: 'গাজীপুর', label: 'গাজীপুর' },
    { value: 'সাভার', label: 'সাভার' },
  ];
}

describe('SearchableSelectComponent', () => {
  function create(): ComponentFixture<HostComponent> {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('bn', bn);
    translate.use('bn');
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture;
  }

  function type(fixture: ComponentFixture<HostComponent>, text: string): void {
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.focus();
    input.dispatchEvent(new Event('focus'));
    input.value = text;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  const optionLabels = (fixture: ComponentFixture<HostComponent>) =>
    [...fixture.nativeElement.querySelectorAll('[role=option]')].map((o) => (o as HTMLElement).textContent?.trim());

  it('shows the label of the current value', () => {
    const fixture = create();
    fixture.componentInstance.control.setValue('সাভার');
    fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('input') as HTMLInputElement).value).toBe('সাভার');
  });

  it('filters the options as the member types', () => {
    const fixture = create();
    type(fixture, 'গাজী');
    expect(optionLabels(fixture)).toEqual(['গাজীপুর']);
  });

  it('says so when nothing matches', () => {
    const fixture = create();
    type(fixture, 'zzz');
    expect(optionLabels(fixture)).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('কিছু পাওয়া যায়নি');
  });

  it('selecting an option writes its value to the control and closes the list', () => {
    const fixture = create();
    type(fixture, 'সা');
    (fixture.nativeElement.querySelector('[role=option]') as HTMLElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.control.value).toBe('সাভার');
    expect(optionLabels(fixture)).toEqual([]);
  });

  it('clears the control when the text is emptied', () => {
    const fixture = create();
    fixture.componentInstance.control.setValue('ঢাকা');
    type(fixture, '');
    expect(fixture.componentInstance.control.value).toBe('');
  });

  it('is at least 48px tall via tap-48 and can be disabled', () => {
    const fixture = create();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(input.classList.contains('tap-48')).toBe(true);
    fixture.componentInstance.control.disable();
    fixture.detectChanges();
    expect(input.disabled).toBe(true);
  });
});
