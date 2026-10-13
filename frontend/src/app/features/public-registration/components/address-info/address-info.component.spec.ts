import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormBuilder, FormGroup } from '@angular/forms';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import bn from '../../../../../../public/i18n/bn.json';
import { buildRegistrationForm } from '../../registration-form.builder';
import { NO_UI_FLAGS, type RegistrationUiFlags } from '../../registration-ui-flags';
import { AddressLocationService } from '../../services/address-location.service';
import { AddressInfoComponent } from './address-info.component';

const geo = {
  divisions: [
    { id: '1', name: 'Dhaka', bn_name: 'ঢাকা' },
    { id: '2', name: 'Khulna', bn_name: 'খুলনা' },
  ],
  districts: [
    { id: '1', division_id: '1', name: 'Dhaka', bn_name: 'ঢাকা' },
    { id: '2', division_id: '1', name: 'Gazipur', bn_name: 'গাজীপুর' },
    { id: '3', division_id: '2', name: 'Khulna', bn_name: 'খুলনা' },
  ],
  upazilas: [
    { district_id: '1', name: 'Savar', bn_name: 'সাভার' },
    { district_id: '1', name: 'Dhamrai', bn_name: 'ধামরাই' },
    { district_id: '3', name: 'Dumuria', bn_name: 'ডুমুরিয়া' },
  ],
};

const locationStub = {
  getDivisions: () => of(geo.divisions),
  getDistrictsByDivisionName: (name: string) => {
    const division = geo.divisions.find((d) => d.bn_name === name || d.name === name);
    return of(division ? geo.districts.filter((d) => d.division_id === division.id) : []);
  },
  getUpazilasByDistrictName: (name: string) => {
    const district = geo.districts.find((d) => d.bn_name === name || d.name === name);
    return of(district ? geo.upazilas.filter((u) => u.district_id === district.id) : []);
  },
};

describe('AddressInfoComponent', () => {
  let form: FormGroup;

  function create(ui: Partial<RegistrationUiFlags> = {}): ComponentFixture<AddressInfoComponent> {
    form = buildRegistrationForm(new FormBuilder());
    TestBed.configureTestingModule({
      providers: [provideTranslateService(), { provide: AddressLocationService, useValue: locationStub }],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('bn', bn);
    translate.use('bn');
    const fixture = TestBed.createComponent(AddressInfoComponent);
    fixture.componentRef.setInput('form', form);
    fixture.componentRef.setInput('ui', { ...NO_UI_FLAGS, ...ui });
    fixture.detectChanges();
    fixture.detectChanges();
    return fixture;
  }

  const q = (f: ComponentFixture<AddressInfoComponent>, sel: string) => f.nativeElement.querySelector(sel) as HTMLElement | null;

  describe('all flags off', () => {
    it('keeps plain selects, an unchecked "same as current" and no abroad toggle', () => {
      const f = create();
      expect(q(f, 'select#currentAddress_division')).not.toBeNull();
      expect(q(f, 'app-searchable-select')).toBeNull();
      expect((q(f, '#sameAsCurrentAddress') as HTMLInputElement).checked).toBe(false);
      expect(q(f, '[data-testid="abroad-toggle"]')).toBeNull();
      expect(form.get('currentAddress.division')!.value).toBe('');
    });

    it('marks the road as required', () => {
      const f = create();
      expect(q(f, 'label[for=currentAddress_road] .required')).not.toBeNull();
    });
  });

  describe('reg_simplified_ui', () => {
    it('preselects ঢাকা → ঢাকা → সাভার for the current address', () => {
      const f = create({ simplified: true });
      expect(form.get('currentAddress.division')!.value).toBe('ঢাকা');
      expect(form.get('currentAddress.district')!.value).toBe('ঢাকা');
      expect(form.get('currentAddress.upazila')!.value).toBe('সাভার');
      expect(q(f, 'app-searchable-select')).not.toBeNull();
    });

    it('ticks "same as current" and copies the preselection to the permanent address', () => {
      const f = create({ simplified: true });
      expect((q(f, '#sameAsCurrentAddress') as HTMLInputElement).checked).toBe(true);
      expect(form.get('permanentAddress')!.disabled).toBe(true);
      expect(form.getRawValue().permanentAddress.upazila).toBe('সাভার');
    });

    it('does not overwrite an address that was restored from a draft', () => {
      form = buildRegistrationForm(new FormBuilder());
      form.get('currentAddress')!.patchValue({ division: 'খুলনা', district: 'খুলনা', upazila: 'ডুমুরিয়া' });
      TestBed.configureTestingModule({
        providers: [provideTranslateService(), { provide: AddressLocationService, useValue: locationStub }],
      });
      const f = TestBed.createComponent(AddressInfoComponent);
      f.componentRef.setInput('form', form);
      f.componentRef.setInput('ui', { ...NO_UI_FLAGS, simplified: true });
      f.detectChanges();
      expect(form.get('currentAddress.division')!.value).toBe('খুলনা');
      expect(form.get('currentAddress.upazila')!.value).toBe('ডুমুরিয়া');
    });
  });

  describe('reg_abroad_address', () => {
    it('shows the "বিদেশে থাকি" toggle and, when ticked, swaps the BD fields for country, city and text', () => {
      const f = create({ abroadAddress: true });
      const toggle = q(f, '[data-testid="abroad-toggle"]') as HTMLInputElement;
      expect(f.nativeElement.textContent).toContain('বিদেশে থাকি');
      expect(q(f, '#currentAddress_division')).not.toBeNull();
      toggle.click();
      f.detectChanges();
      expect(form.get('currentAddressAbroad')!.value).toBe(true);
      expect(q(f, '#currentAddress_division')).toBeNull();
      expect(q(f, '#currentCountry')).not.toBeNull();
      expect(q(f, '#currentCity')).not.toBeNull();
      expect(q(f, '#currentAddressText')).not.toBeNull();
    });

    it('keeps the permanent address in Bangladesh and editable', () => {
      const f = create({ abroadAddress: true, simplified: true });
      (q(f, '[data-testid="abroad-toggle"]') as HTMLInputElement).click();
      f.detectChanges();
      expect(form.get('permanentAddress')!.enabled).toBe(true);
      expect((q(f, '#sameAsCurrentAddress') as HTMLInputElement | null)?.disabled ?? true).toBe(true);
      expect(f.nativeElement.textContent).toContain('স্থায়ী ঠিকানা বাংলাদেশেরটাই দিন।');
    });

    it('writes the chosen country code, city and free text into the form', () => {
      const f = create({ abroadAddress: true });
      (q(f, '[data-testid="abroad-toggle"]') as HTMLInputElement).click();
      f.detectChanges();
      const city = q(f, '#currentCity') as HTMLInputElement;
      city.value = 'Riyadh';
      city.dispatchEvent(new Event('input'));
      const text = q(f, '#currentAddressText') as HTMLTextAreaElement;
      text.value = 'Olaya St';
      text.dispatchEvent(new Event('input'));
      form.get('currentCountry')!.setValue('SA');
      expect(form.value.currentCity).toBe('Riyadh');
      expect(form.value.currentAddressText).toBe('Olaya St');
      expect(form.value.currentCountry).toBe('SA');
    });

    it('the country list excludes Bangladesh', () => {
      const f = create({ abroadAddress: true });
      const values = f.componentInstance.countryOptions().map((o) => o.value);
      expect(values).toContain('SA');
      expect(values).not.toContain('BD');
    });

    it('unticking returns to the Bangladesh address', () => {
      const f = create({ abroadAddress: true });
      const toggle = q(f, '[data-testid="abroad-toggle"]') as HTMLInputElement;
      toggle.click();
      toggle.click();
      f.detectChanges();
      expect(form.get('currentAddressAbroad')!.value).toBe(false);
      expect(q(f, '#currentAddress_division')).not.toBeNull();
    });
  });

  it('reg_road_optional: the road label has no required star', () => {
    const f = create({ roadOptional: true });
    expect(q(f, 'label[for=currentAddress_road] .required')).toBeNull();
    expect(q(f, 'label[for=permanentAddress_road] .required')).toBeNull();
  });
});
