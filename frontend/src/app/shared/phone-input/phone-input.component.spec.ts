import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { PhoneInputComponent } from './phone-input.component';
import { internationalPhoneValidator } from './phone-number';

const EN = {
  phoneInput: {
    invalid: 'This number is not correct. Choose the country and enter the full number.',
    warning: 'We do not recognise this number - please check it again',
  },
};

@Component({
  imports: [PhoneInputComponent, ReactiveFormsModule],
  template: `<app-phone-input inputId="p" [formControl]="control" />`,
})
class HostComponent {
  readonly control = new FormControl('', { nonNullable: true, validators: [internationalPhoneValidator] });
}

@Component({
  imports: [PhoneInputComponent, ReactiveFormsModule],
  template: `<app-phone-input [formControl]="control" />`,
})
class BareHostComponent {
  readonly control = new FormControl('', { nonNullable: true });
}

describe('PhoneInputComponent', () => {
  function setup(initial = '') {
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideTranslateService({ fallbackLang: 'en' })],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', EN);
    translate.use('en');
    const fixture = TestBed.createComponent(HostComponent);
    if (initial) fixture.componentInstance.control.setValue(initial);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const control = fixture.componentInstance.control;

    const numberInput = () => root.querySelector<HTMLInputElement>('input[type="tel"]')!;
    const trigger = () => root.querySelector<HTMLButtonElement>('.phone-country-trigger')!;
    const type = (text: string) => {
      const input = numberInput();
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
    };
    const paste = (text: string) => {
      const event = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } });
      numberInput().dispatchEvent(event);
      fixture.detectChanges();
      return event;
    };
    const openPanel = () => {
      trigger().click();
      fixture.detectChanges();
    };
    const warning = () => root.querySelector('.phone-warning');
    return { fixture, root, control, numberInput, trigger, type, paste, openPanel, warning };
  }

  it('uses a tel keyboard', () => {
    const { numberInput } = setup();
    expect(numberInput().getAttribute('inputmode')).toBe('tel');
    expect(numberInput().type).toBe('tel');
  });

  it('defaults to Bangladesh (+880) and turns a national 0 number into E.164', () => {
    const { trigger, type, control } = setup();
    expect(trigger().textContent).toContain('+880');
    type('01712345678');
    expect(control.value).toBe('+8801712345678');
  });

  it('converts Bangla digits as they are typed', () => {
    const { numberInput, type, control } = setup();
    type('০১৭১২৩৪৫৬৭৮');
    expect(control.value).toBe('+8801712345678');
    expect(numberInput().value).toBe('01712345678');
  });

  it('switches country when a +966 number is typed or autofilled', () => {
    const { trigger, type, control } = setup();
    type('+966 50 123 4567');
    expect(control.value).toBe('+966501234567');
    expect(trigger().textContent).toContain('+966');
  });

  it('switches country on paste of a 00-prefixed number and shows the national part', () => {
    const { trigger, paste, control, numberInput } = setup();
    const event = paste('0044 7911 123456');
    expect(event.defaultPrevented).toBe(true);
    expect(control.value).toBe('+447911123456');
    expect(trigger().textContent).toContain('+44');
    expect(numberInput().value.replace(/\s/g, '')).toBe('7911123456');
  });

  it('switches country on paste of a +… number', () => {
    const { trigger, paste, control } = setup();
    paste('+966 50 123 4567');
    expect(control.value).toBe('+966501234567');
    expect(trigger().textContent).toContain('+966');
  });

  it('leaves a normal national paste to the browser but still normalises it', () => {
    const { paste, control, numberInput, type } = setup();
    const event = paste('01712345678');
    expect(event.defaultPrevented).toBe(false);
    // The browser then fires input with the pasted text.
    numberInput().value = '01712345678';
    type('01712345678');
    expect(control.value).toBe('+8801712345678');
  });

  it('handles the leading 0 per picked country (UK 07911123456 -> +447911123456)', () => {
    const { openPanel, root, fixture, type, control } = setup();
    openPanel();
    const gb = [...root.querySelectorAll<HTMLElement>('.phone-country-list li')].find((li) =>
      li.textContent?.includes('+44'),
    )!;
    gb.click();
    fixture.detectChanges();
    type('07911123456');
    expect(control.value).toBe('+447911123456');
  });

  it('reads an existing E.164 value back into country + national number', () => {
    const { trigger, numberInput } = setup('+966501234567');
    expect(trigger().textContent).toContain('+966');
    expect(numberInput().value.replace(/\s/g, '')).toBe('501234567');
  });

  describe('validation feedback', () => {
    it('marks an impossible number invalid on the control (blocks submit)', () => {
      const { type, control } = setup();
      type('0171');
      expect(control.errors).toEqual({ phoneInvalid: true });
    });

    it('shows a non-blocking warning for a possible-but-unrecognised number, value stays E.164', () => {
      const { type, control, warning } = setup();
      type('0171234567'); // one digit short of a real BD mobile
      expect(control.value).toBe('+880171234567');
      expect(control.valid).toBe(true);
      expect(warning()?.textContent).toContain('We do not recognise this number');
      expect(warning()?.getAttribute('role')).toBe('status');
    });

    it('shows no warning for a valid number', () => {
      const { type, warning } = setup();
      type('01712345678');
      expect(warning()).toBeNull();
    });

    it('shows no warning while empty', () => {
      const { type, warning } = setup();
      type('');
      expect(warning()).toBeNull();
    });

    it('shows no warning for an impossible number (that is the error tier)', () => {
      const { type, warning } = setup();
      type('0171');
      expect(warning()).toBeNull();
    });
  });

  describe('country picker', () => {
    it('lists the pinned countries first, in order, then a divider, then the full list', () => {
      const { openPanel, root } = setup();
      openPanel();
      const pinned = [...root.querySelectorAll<HTMLElement>('.phone-country-list li.is-pinned')];
      expect(pinned.map((li) => li.dataset['code'])).toEqual([
        'BD', 'SA', 'AE', 'QA', 'KW', 'OM', 'BH', 'MY', 'SG', 'GB', 'US', 'IT', 'MV', 'JP', 'AU',
      ]);
      const items = [...root.querySelectorAll<HTMLElement>('.phone-country-list li')];
      const divider = root.querySelector('.phone-country-list .phone-country-divider')!;
      expect(divider).not.toBeNull();
      expect(items.indexOf(divider as HTMLElement)).toBe(pinned.length);
      expect(items.length).toBeGreaterThan(pinned.length + 200);
    });

    it('searches the full list and hides the pinned block while searching', () => {
      const { openPanel, root, fixture } = setup();
      openPanel();
      const search = root.querySelector<HTMLInputElement>('.phone-country-search')!;
      search.value = 'japan';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
      const items = [...root.querySelectorAll<HTMLElement>('.phone-country-list li[role="option"]')];
      expect(items.map((li) => li.dataset['code'])).toContain('JP');
      expect(root.querySelector('.phone-country-divider')).toBeNull();
      expect(root.querySelectorAll('li.is-pinned').length).toBe(0);
    });

    it('closes after picking and emits the number under the new country', () => {
      const { openPanel, root, fixture, type, control } = setup();
      type('50 123 4567');
      openPanel();
      root.querySelector<HTMLElement>('li[data-code="SA"]')!.click();
      fixture.detectChanges();
      expect(root.querySelector('.phone-country-panel')).toBeNull();
      expect(control.value).toBe('+966501234567');
    });
  });

  describe('as its own validator', () => {
    it('reports phoneInvalid even when the host form added no validator (template-driven forms)', () => {
      TestBed.configureTestingModule({
        imports: [BareHostComponent],
        providers: [provideTranslateService({ fallbackLang: 'en' })],
      });
      const fixture = TestBed.createComponent(BareHostComponent);
      fixture.detectChanges();
      const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[type="tel"]')!;
      input.value = '0171';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      expect(fixture.componentInstance.control.errors).toEqual({ phoneInvalid: true });
      input.value = '01712345678';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      expect(fixture.componentInstance.control.errors).toBeNull();
    });
  });
});
