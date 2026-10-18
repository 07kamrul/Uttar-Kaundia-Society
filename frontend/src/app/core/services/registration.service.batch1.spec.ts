import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FeatureFlagKey, FeatureFlagService } from './feature-flag.service';
import { RegistrationService } from './registration.service';
import type { FormDataModel } from '../models/registration.model';

const address = {
  house: '১২',
  road: '',
  postOffice: 'সাভার',
  upazila: 'সাভার',
  district: 'ঢাকা',
  division: 'ঢাকা',
};

function formData(over: Partial<FormDataModel> = {}): FormDataModel {
  return {
    fullName: 'রহিম',
    fatherOrHusband: 'করিম',
    mother: 'রহিমা',
    dob: '1990-02-03',
    nationality: '',
    occupation: '',
    nid: '১২৩৪৫৬৭৮৯০',
    mobile: '+8801711111111',
    gender: 'পুরুষ',
    email: 'a@b.co',
    permanentAddress: address,
    currentAddress: address,
    propertyCount: 1,
    properties: [
      {
        propertyType: ['জমি'],
        propertyTypeOther: '',
        khatianNo: '২২১৪',
        dagNo: { cs: '৩৪৫', rs: '' },
        holdingNumber: '',
        landQuantity: '২.৫',
        myShareQuantity: '১.২৫',
        ownership: 'একক',
        jointOwnerCount: null,
        dagUnknown: true,
        applicableDocs: [{ type: 'খতিয়ান/পর্চা', fileName: 'a.jpg', fileDataUrl: 'data:image/jpeg;base64,AAAA' }],
      },
    ],
    nominees: [],
    admissionFee: '500',
    subscription: '60',
    receiptNo: 'T1',
    paymentMethod: 'bkash',
    memberSignature: '',
    submissionDate: '2026-10-13',
    memberPhoto: 'data:image/jpeg;base64,AAAA',
    hasWhatsapp: true,
    currentAddressAbroad: false,
    currentCountry: '',
    currentCity: '',
    currentAddressText: '',
    consentVersion: '2026-10',
    ...over,
  } as FormDataModel;
}

describe('RegistrationService batch 1 payload', () => {
  let http: HttpTestingController;
  let service: RegistrationService;
  let enabled: Set<FeatureFlagKey>;

  beforeEach(() => {
    enabled = new Set();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: FeatureFlagService, useValue: { isEnabled: (k: FeatureFlagKey) => enabled.has(k) } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(RegistrationService);
  });
  afterEach(() => http.verify());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function send(data: FormDataModel): any {
    service.submit(data).subscribe();
    const req = http.expectOne((r) => r.url.endsWith('/submissions'));
    const payload = JSON.parse((req.request.body as FormData).get('payload') as string);
    req.flush({ id: 1 });
    return payload;
  }

  it('with every flag off sends none of the new fields and keeps the legacy shape', () => {
    const p = send(formData());
    for (const key of [
      'has_whatsapp',
      'current_address_abroad',
      'current_country',
      'current_city',
      'current_address_text',
      'consent_version',
    ]) {
      expect(p).not.toHaveProperty(key);
    }
    expect(p.properties[0]).not.toHaveProperty('dag_unknown');
    expect(p.payment_method).toBe('bkash');
    expect(p.occupation).toBe('');
    expect(p.nationality).toBe('');
  });

  it('always sends ASCII digits for NID, khatian, dag and land quantities', () => {
    const p = send(formData());
    expect(p.nid).toBe('1234567890');
    expect(p.properties[0].khatian_no).toBe('2214');
    expect(p.properties[0].dag_no_cs).toBe('345');
    expect(p.properties[0].land_quantity).toBe('2.5');
    expect(p.properties[0].my_share_quantity).toBe('1.25');
  });

  it('simplified UI sends whatsapp, consent version and the canonical payment key', () => {
    enabled.add('reg_simplified_ui');
    const p = send(formData({ paymentMethod: 'bkash' }));
    expect(p.has_whatsapp).toBe(true);
    expect(p.consent_version).toBe('2026-10');
    expect(p.payment_method).toBe('bkash');
  });

  it('dag unknown is sent only with reg_dag_unknown on', () => {
    enabled.add('reg_dag_unknown');
    const p = send(formData());
    expect(p.properties[0].dag_unknown).toBe(true);
  });

  it('hides nationality and optional occupation: server default applies', () => {
    enabled.add('reg_hide_nationality');
    enabled.add('reg_occupation_optional');
    const p = send(formData());
    expect(p.nationality).toBe('বাংলাদেশী');
    expect(p.occupation).toBeNull();
  });

  it('abroad address: sends country/city/text, null BD parts, permanent stays BD', () => {
    enabled.add('reg_abroad_address');
    const p = send(
      formData({
        currentAddressAbroad: true,
        currentCountry: 'SA',
        currentCity: 'Riyadh',
        currentAddressText: 'Olaya St, Flat 4',
      }),
    );
    expect(p.current_address_abroad).toBe(true);
    expect(p.current_country).toBe('SA');
    expect(p.current_city).toBe('Riyadh');
    expect(p.current_address_text).toBe('Olaya St, Flat 4');
    expect(p.current_address).toBeNull();
    expect(p.permanent_address.division).toBe('ঢাকা');
  });

  it('abroad toggle is ignored when its flag is off', () => {
    const p = send(formData({ currentAddressAbroad: true, currentCountry: 'SA' }));
    expect(p).not.toHaveProperty('current_address_abroad');
    expect(p.current_address.district).toBe('ঢাকা');
  });

  it('reg_min_one_proof drops document entries that have no file', () => {
    enabled.add('reg_min_one_proof');
    const data = formData();
    data.properties[0].applicableDocs.push({ type: 'খাজনা/কর রশিদ', fileName: '', fileDataUrl: '' });
    const p = send(data);
    expect(p.properties[0].applicable_docs).toEqual([{ doc_type: 'খতিয়ান/পর্চা' }]);
  });

  it('getRegistrationConfig reads the public config endpoint', () => {
    let result: unknown;
    service.getRegistrationConfig().subscribe((r) => (result = r));
    const req = http.expectOne((r) => r.url.endsWith('/public/registration-config'));
    req.flush({
      consent_version: '2026-10',
      payment_accounts: [
        {
          id: 3,
          type: 'mfs',
          method: 'bkash',
          display_order: 1,
          label: 'বিকাশ 017',
          bank_name: null,
          branch_name: null,
          account_name: null,
          account_number: null,
          routing_number: null,
          provider: 'bkash',
          mfs_number: '017',
          account_kind: 'personal',
          account_holder: null,
          instructions: null,
          qr_image_url: null,
        },
      ],
    });
    expect(result).toEqual({
      consentVersion: '2026-10',
      paymentAccounts: [
        {
          id: 3,
          type: 'mfs',
          method: 'bkash',
          displayOrder: 1,
          label: 'বিকাশ 017',
          bankName: null,
          branchName: null,
          accountName: null,
          accountNumber: null,
          routingNumber: null,
          provider: 'bkash',
          mfsNumber: '017',
          accountKind: 'personal',
          accountHolder: null,
          instructions: null,
          qrImageUrl: null,
        },
      ],
    });
  });

  it('sends the chosen payment account id alongside the method', () => {
    const p = send(formData({ paymentAccountId: 12 }));
    expect(p.payment_account_id).toBe(12);
  });

  it('sends payment_account_id null when no account was chosen (cash/other)', () => {
    const p = send(formData());
    expect(p.payment_account_id).toBeNull();
  });
});
