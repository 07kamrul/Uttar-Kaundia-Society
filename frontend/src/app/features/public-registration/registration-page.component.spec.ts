import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormBuilder } from '@angular/forms';
import { provideRouter } from '@angular/router';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it } from 'vitest';
import bn from '../../../../public/i18n/bn.json';
import { FeatureFlagKey, FeatureFlagService } from '../../core/services/feature-flag.service';
import { RegistrationPageComponent } from './registration-page.component';
import { RegistrationDraftService } from './services/registration-draft.service';
import { buildApplicableDocGroup, buildPropertyGroup, propertiesArray, applicableDocsArray } from './registration-form.builder';

const DATA_URL = 'data:image/jpeg;base64,AAAA';

/** The test runner's localStorage is a stub; a real in-memory one is needed for drafts. */
class MemoryStorage {
  private readonly entries = new Map<string, string>();
  get length(): number {
    return this.entries.size;
  }
  clear(): void {
    this.entries.clear();
  }
  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.entries.delete(key);
  }
  setItem(key: string, value: string): void {
    this.entries.set(key, String(value));
  }
}

describe('RegistrationPageComponent', () => {
  let enabled: Set<FeatureFlagKey>;
  let http: HttpTestingController;
  let translate: TranslateService;
  const fb = new FormBuilder();

  function create(...flags: FeatureFlagKey[]): ComponentFixture<RegistrationPageComponent> {
    enabled = new Set(flags);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideTranslateService(),
        { provide: FeatureFlagService, useValue: { isEnabled: (k: FeatureFlagKey) => enabled.has(k) } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    translate = TestBed.inject(TranslateService);
    translate.setTranslation('bn', bn);
    translate.use('bn');
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });
    const fixture = TestBed.createComponent(RegistrationPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  const t = (key: string) => translate.instant(key);

  function address() {
    return { house: '১২', road: 'মেইন রোড', postOffice: 'সাভার', upazila: 'সাভার', district: 'ঢাকা', division: 'ঢাকা' };
  }

  type Addr = Record<string, string>;

  /** Division, district and upazila are cascading (a change resets the next), so set them in order. */
  function setAddress(page: RegistrationPageComponent, name: string, value: Addr): void {
    const group = page.form.get(name)!;
    for (const field of ['division', 'district', 'upazila', 'postOffice', 'road', 'house']) {
      group.get(field)!.setValue(value[field]);
    }
  }

  function fillMember(page: RegistrationPageComponent, over: Record<string, unknown> = {}): void {
    const { currentAddress, permanentAddress, ...rest } = over;
    page.form.patchValue({
      fullName: 'রহিম',
      fatherOrHusband: 'করিম',
      mother: 'রহিমা',
      dob: '1990-02-03',
      gender: 'পুরুষ',
      mobile: '+8801711111111',
      email: 'rahim@example.com',
      nid: '1234567890',
      memberPhoto: DATA_URL,
      ...rest,
    });
    setAddress(page, 'currentAddress', (currentAddress as Addr) ?? address());
    setAddress(page, 'permanentAddress', (permanentAddress as Addr) ?? address());
  }

  function fillProperty(page: RegistrationPageComponent, withDoc = true, over: Record<string, unknown> = {}) {
    const group = buildPropertyGroup(fb);
    group.patchValue({
      propertyType: ['জমি'],
      khatianNo: '২২১৪',
      dagNo: { cs: '৩৪৫', rs: '৪৫৬' },
      landQuantity: '২.৫',
      myShareQuantity: '১.২৫',
      ownership: 'একক',
      ...over,
    });
    if (withDoc) {
      const docs = applicableDocsArray(group);
      docs.push(buildApplicableDocGroup(fb, 'খতিয়ান/পর্চা'));
      docs.at(0).patchValue({ fileName: 'a.jpg', fileDataUrl: DATA_URL });
    }
    propertiesArray(page.form).push(group);
    page.form.patchValue({ propertyCount: propertiesArray(page.form).length });
    return group;
  }

  function fillRest(page: RegistrationPageComponent): void {
    page.form.patchValue({
      urgentContactName: 'করিম',
      urgentContactMobile: '+8801811111111',
      admissionFee: 500,
      subscription: 60,
      paymentMethod: 'bkash',
      receiptNo: 'T123',
      declarationAccepted: true,
    });
    page.nominees.at(0).patchValue({ name: 'রহিমা', mobile: '+8801911111111' });
  }

  function flushInitial(): void {
    http.match(() => true).forEach((r) => {
      if (r.request.url.endsWith('/public/fee-settings')) r.flush({ admission_fee: 500 });
      else if (r.request.url.endsWith('/public/registration-config'))
        r.flush({ consent_version: '2026-10', payment_accounts: [] });
      else if (r.request.url.endsWith('bd-geo.json')) r.flush({ divisions: [], districts: [], upazilas: [] });
      else if (!r.cancelled) r.flush([]);
    });
  }

  beforeEach(() => TestBed.resetTestingModule());

  describe('flags off (legacy behaviour)', () => {
    it('blocks step 1 when email is empty', () => {
      const page = create().componentInstance;
      fillMember(page, { email: '' });
      page.goToStep(2);
      expect(page.currentStep).toBe(1);
      expect(page.errors).toContain(t('registration.memberInfo.emailRequired'));
    });

    it('blocks step 1 when NID is empty', () => {
      const page = create().componentInstance;
      fillMember(page, { nid: '' });
      page.goToStep(2);
      expect(page.currentStep).toBe(1);
      expect(page.errors).toContain(t('registration.memberInfo.nidRequired'));
    });

    it('blocks step 1 when the NID is not 10, 13 or 17 digits', () => {
      const page = create().componentInstance;
      fillMember(page, { nid: '12345678901' });
      page.goToStep(2);
      expect(page.errors).toContain(t('registration.validation.nidInvalid'));
    });

    it('blocks step 1 when the photo is missing', () => {
      const page = create().componentInstance;
      fillMember(page, { memberPhoto: '' });
      page.goToStep(2);
      expect(page.currentStep).toBe(1);
      expect(page.errors).toContain(t('registration.memberInfo.memberPhotoRequired'));
    });

    it('moves on once the member step is complete', () => {
      const page = create().componentInstance;
      fillMember(page);
      page.goToStep(2);
      expect(page.errors).toEqual([]);
      expect(page.currentStep).toBe(2);
    });

    it('still requires every document ticked to have a file and ignores the new flag fields', () => {
      const page = create().componentInstance;
      fillMember(page);
      fillProperty(page, false);
      page.goToStep(2);
      page.goToStep(3);
      expect(page.currentStep).toBe(2);
      expect(page.errors.some((e) => e.endsWith(t('registration.validation.applicableDocsRequired')))).toBe(true);
    });

    it('does not show the simplified step header or draft line', () => {
      const fixture = create();
      const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(text).not.toContain('ধাপ ১ / ৬');
      expect(fixture.nativeElement.querySelector('.reg-simplified')).toBeNull();
    });

    it('submits ASCII digits and none of the new fields', () => {
      const fixture = create();
      const page = fixture.componentInstance;
      fillMember(page, { nid: '১২৩৪৫৬৭৮৯০' });
      fillProperty(page);
      fillRest(page);
      page.onSubmit();
      const req = http.expectOne((r) => r.url.endsWith('/submissions'));
      const payload = JSON.parse((req.request.body as FormData).get('payload') as string);
      expect(payload.nid).toBe('1234567890');
      expect(payload.properties[0].land_quantity).toBe('2.5');
      expect(payload).not.toHaveProperty('has_whatsapp');
      expect(payload).not.toHaveProperty('consent_version');
      req.flush({ id: 7 });
      flushInitial();
      expect(page.success).toEqual({ id: '7' });
    });
  });

  describe('reg_simplified_ui', () => {
    it('shows "ধাপ ১ / ৬" header, the single-column class and the draft line', () => {
      const fixture = create('reg_simplified_ui');
      const page = fixture.componentInstance;
      TestBed.inject(RegistrationDraftService).saveNow(page.form, 1);
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelector('.reg-simplified')).not.toBeNull();
      expect(root.textContent).toContain('ধাপ ১ / ৬ — আপনার তথ্য');
      expect(root.textContent).toContain('আপনার তথ্য সংরক্ষিত আছে, পরে আবার এসে শেষ করতে পারেন।');
    });

    it('happy path with Bangla digits: NID, khatian, dag and land quantity reach the server as ASCII', () => {
      const fixture = create('reg_simplified_ui');
      const page = fixture.componentInstance;
      fillMember(page, { nid: '১২৩৪৫৬৭৮৯০', hasWhatsapp: true });
      fillProperty(page);
      fillRest(page);
      flushInitial();
      page.onSubmit();
      const req = http.expectOne((r) => r.url.endsWith('/submissions'));
      const payload = JSON.parse((req.request.body as FormData).get('payload') as string);
      expect(payload.nid).toBe('1234567890');
      expect(payload.properties[0].khatian_no).toBe('2214');
      expect(payload.properties[0].dag_no_cs).toBe('345');
      expect(payload.properties[0].land_quantity).toBe('2.5');
      expect(payload.properties[0].my_share_quantity).toBe('1.25');
      expect(payload.has_whatsapp).toBe(true);
      expect(payload.consent_version).toBe('2026-10');
      req.flush({ id: 9 });
      expect(page.success).toEqual({ id: '9' });
    });

    it('starts has_whatsapp at false, and leaves it null with the flag off', () => {
      expect(create('reg_simplified_ui').componentInstance.form.get('hasWhatsapp')!.value).toBe(false);
      TestBed.resetTestingModule();
      expect(create().componentInstance.form.get('hasWhatsapp')!.value).toBeNull();
    });

    it('reads the consent version from the config endpoint, not a constant', () => {
      create('reg_simplified_ui');
      const cfg = http.expectOne((r) => r.url.endsWith('/public/registration-config'));
      expect(cfg.request.method).toBe('GET');
      cfg.flush({ consent_version: '2027-01', payment_accounts: [] });
      flushInitial();
    });

    it('keeps working when the config endpoint fails', () => {
      const fixture = create('reg_simplified_ui');
      http.expectOne((r) => r.url.endsWith('/public/registration-config')).error(new ProgressEvent('x'));
      expect(fixture.componentInstance.config()).toBeNull();
    });
  });

  describe('reg_abroad_address', () => {
    it('requires country, city and address when living abroad, and skips the BD current address', () => {
      const page = create('reg_abroad_address').componentInstance;
      fillMember(page, {
        currentAddressAbroad: true,
        currentAddress: { house: '', road: '', postOffice: '', upazila: '', district: '', division: '' },
      });
      page.goToStep(2);
      expect(page.currentStep).toBe(1);
      expect(page.errors).toContain(t('registration.validation.abroadCountryRequired'));
      expect(page.errors).toContain(t('registration.validation.abroadCityRequired'));
      expect(page.errors).toContain(t('registration.validation.abroadAddressRequired'));
    });

    it('rejects Bangladesh as the country abroad', () => {
      const page = create('reg_abroad_address').componentInstance;
      fillMember(page, { currentAddressAbroad: true, currentCountry: 'BD', currentCity: 'ঢাকা', currentAddressText: 'x' });
      page.goToStep(2);
      expect(page.errors).toContain(t('registration.validation.abroadCountryNotBd'));
    });

    it('accepts a complete abroad address and sends it with a null BD current address', () => {
      const fixture = create('reg_abroad_address');
      const page = fixture.componentInstance;
      fillMember(page, {
        currentAddressAbroad: true,
        currentCountry: 'SA',
        currentCity: 'Riyadh',
        currentAddressText: 'Olaya St',
        currentAddress: { house: '', road: '', postOffice: '', upazila: '', district: '', division: '' },
      });
      fillProperty(page);
      fillRest(page);
      page.onSubmit();
      const req = http.expectOne((r) => r.url.endsWith('/submissions'));
      const payload = JSON.parse((req.request.body as FormData).get('payload') as string);
      expect(payload.current_address).toBeNull();
      expect(payload.current_country).toBe('SA');
      expect(payload.permanent_address.district).toBe('ঢাকা');
      req.flush({ id: 1 });
    });

    it('is ignored when the flag is off: the BD current address is still required', () => {
      const page = create().componentInstance;
      fillMember(page, {
        currentAddressAbroad: true,
        currentCountry: 'SA',
        currentCity: 'Riyadh',
        currentAddressText: 'Olaya St',
        currentAddress: { house: '', road: '', postOffice: '', upazila: '', district: '', division: '' },
      });
      page.goToStep(2);
      expect(page.currentStep).toBe(1);
    });
  });

  describe('property flags', () => {
    it('reg_min_one_proof: one file among the four types is enough, none is an error', () => {
      const page = create('reg_min_one_proof').componentInstance;
      fillMember(page);
      fillProperty(page, false);
      page.goToStep(2);
      page.goToStep(3);
      expect(page.currentStep).toBe(2);
      expect(page.errors).toContain(`${translate.instant('registration.validation.propertyLabel', { number: 1 })}: ${t('registration.validation.proofRequired')}`);

      propertiesArray(page.form).clear();
      fillProperty(page, true);
      page.goToStep(3);
      expect(page.currentStep).toBe(3);
    });

    it('reg_min_one_proof: an empty slot next to a filled one does not block', () => {
      const page = create('reg_min_one_proof').componentInstance;
      fillMember(page);
      const group = fillProperty(page, true);
      applicableDocsArray(group).push(buildApplicableDocGroup(fb, 'খাজনা/কর রশিদ'));
      page.goToStep(2);
      page.goToStep(3);
      expect(page.currentStep).toBe(3);
    });

    it('reg_dag_unknown: blank dag passes when the member ticked "I do not know"', () => {
      const page = create('reg_dag_unknown').componentInstance;
      fillMember(page);
      fillProperty(page, true, { dagNo: { cs: '', rs: '' }, dagUnknown: true });
      page.goToStep(2);
      page.goToStep(3);
      expect(page.errors).toEqual([]);
      expect(page.currentStep).toBe(3);
    });

    it('reg_dag_unknown: blank dag without the tick is an error', () => {
      const page = create('reg_dag_unknown').componentInstance;
      fillMember(page);
      fillProperty(page, true, { dagNo: { cs: '', rs: '' }, dagUnknown: false });
      page.goToStep(2);
      page.goToStep(3);
      expect(page.currentStep).toBe(2);
    });
  });

  describe('server errors', () => {
    it('shows the friendly photo message on 422 PHOTO_REQUIRED and jumps to step 1', () => {
      const fixture = create();
      const page = fixture.componentInstance;
      fillMember(page);
      fillProperty(page);
      fillRest(page);
      page.currentStep = 5;
      page.onSubmit();
      http
        .expectOne((r) => r.url.endsWith('/submissions'))
        .flush({ detail: { code: 'PHOTO_REQUIRED' } }, { status: 422, statusText: 'Unprocessable' });
      expect(page.currentStep).toBe(1);
      expect(page.errors).toEqual([t('registration.submit.photoRequired')]);
    });
  });
});
