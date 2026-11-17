import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';
import { AuthService } from '../../core/services/auth.service';
import {
  firstStepToCorrect,
  toApplicationReview,
} from '../../core/models/application-review.model';
import {
  isNewUpload,
  storedFileName,
  storedFilePath,
  toStoredFileValue,
} from '../../core/utils/stored-file';
import { toApplicationFormValue, type ApplicantDetailApi } from './applicant.service';
import { toCorrectionContext } from './application-edit-page.component';
import { CorrectionFieldsPickerComponent } from '../../shared/application-review/correction-fields-picker.component';

function applicantDetail(overrides: Partial<ApplicantDetailApi> = {}): ApplicantDetailApi {
  return {
    id: 7,
    member_id: null,
    status: 'rejected',
    full_name: 'Test User',
    mobile: '+8801700000000',
    created_at: '2026-11-01T00:00:00Z',
    father_or_husband: 'Father',
    mother: 'Mother',
    dob: '1990-01-01',
    nationality: 'বাংলাদেশী',
    occupation: 'Farmer',
    nid: '1234567890',
    gender: 'পুরুষ',
    email: 'member@example.com',
    permanent_house: '12',
    permanent_road: 'Road',
    permanent_post_office: 'PO',
    permanent_upazila: 'Savar',
    permanent_district: 'Dhaka',
    permanent_division: 'Dhaka',
    current_house: null,
    current_road: null,
    current_post_office: null,
    current_upazila: null,
    current_district: null,
    current_division: null,
    urgent_contact_name: 'Contact',
    urgent_contact_relation: null,
    urgent_contact_mobile: '+8801800000000',
    urgent_contact_address: null,
    admission_fee: '500',
    subscription: '100',
    receipt_no: 'R-1',
    payment_method: 'Cash',
    payment_account_snapshot: null,
    member_signature: 'data:image/png;base64,AA==',
    member_photo_path: 'photos/member_7/p.jpg',
    receipt_photo_path: null,
    rejection_reason: 'NID unclear',
    properties: [
      {
        id: 1,
        property_type: ['কৃষি জমি'],
        property_type_other: null,
        khatian_no: '123',
        dag_no_cs: '45',
        dag_no_rs: '67',
        holding_number: null,
        land_quantity: '15',
        my_share_quantity: '1',
        ownership: 'একক',
        joint_owner_count: null,
        applicable_docs: [
          { id: 3, doc_type: 'দলিল', file_path: 'documents/member_7/dolil/deed.pdf' },
          { id: 4, doc_type: 'খতিয়ান', file_path: null },
        ],
      },
    ],
    nominees: [
      { id: 2, name: 'Nominee', relation: 'Son', mobile: '+8801900000000', address: null },
    ],
    ...overrides,
  } as ApplicantDetailApi;
}

describe('stored-file helpers', () => {
  it('round-trips a stored path and never treats it as a new upload', () => {
    const value = toStoredFileValue('documents/member_7/a.pdf');
    expect(storedFilePath(value)).toBe('documents/member_7/a.pdf');
    expect(isNewUpload(value)).toBe(false);
    expect(isNewUpload('data:image/png;base64,AA==')).toBe(true);
    expect(storedFilePath('data:image/png;base64,AA==')).toBeNull();
    expect(storedFileName('documents/member_7/x/deed.pdf')).toBe('deed.pdf');
  });
});

describe('correction field helpers', () => {
  it('picks the earliest wizard step holding a flagged section', () => {
    expect(firstStepToCorrect(['payment', 'documents'])).toBe(2);
    expect(firstStepToCorrect(['nid'])).toBe(1);
    expect(firstStepToCorrect([])).toBeNull();
  });

  it('drops unknown correction keys from the API', () => {
    const review = toApplicationReview({
      id: 1,
      round: 1,
      decision: 'rejected',
      reason: 'x',
      correction_fields: ['nid', 'salary'],
      created_at: '2026-11-01T00:00:00Z',
    });
    expect(review.correctionFields).toEqual(['nid']);
  });
});

describe('toApplicationFormValue', () => {
  it('maps the stored application onto the wizard form with stored-file markers', () => {
    const value = toApplicationFormValue(applicantDetail()) as Record<string, any>;

    expect(value['fullName']).toBe('Test User');
    expect(value['permanentAddress'].postOffice).toBe('PO');
    expect(value['memberPhoto']).toBe('stored:photos/member_7/p.jpg');
    expect(value['receiptFileDataUrl']).toBe('');
    expect(value['propertyCount']).toBe(1);
    const docs = value['properties'][0].applicableDocs;
    expect(docs[0]).toEqual({
      type: 'দলিল',
      fileName: 'deed.pdf',
      fileDataUrl: 'stored:documents/member_7/dolil/deed.pdf',
    });
    expect(docs[1].fileDataUrl).toBe('');
    // The declaration must be confirmed again on every resubmission.
    expect(value['declarationAccepted']).toBe(false);
  });
});

describe('toCorrectionContext', () => {
  it('derives the banner round, labels and flagged steps', () => {
    const ctx = toCorrectionContext({
      id: '7',
      fullName: 'Test',
      email: 'a@b.c',
      status: 'rejected',
      canEdit: true,
      rejectionReason: 'NID unclear',
      correctionFields: ['nid', 'documents', 'photo'],
      reviews: [
        {
          id: '1',
          round: 1,
          decision: 'rejected',
          reason: 'a',
          correctionFields: [],
          createdAt: '',
        },
        {
          id: '2',
          round: 2,
          decision: 'rejected',
          reason: 'b',
          correctionFields: [],
          createdAt: '',
        },
      ],
      resubmissionCount: 1,
      photoUrl: null,
      formValue: {},
    });
    expect(ctx.round).toBe(2);
    expect(ctx.steps).toEqual([1, 2]);
    expect(ctx.fieldLabelKeys).toEqual([
      'application.fields.nid',
      'application.fields.documents',
      'application.fields.photo',
    ]);
  });
});

describe('authGuard for applicants', () => {
  function guardFor(url: string, mustChangePassword = false): true | string {
    const auth = {
      token: 't',
      role: 'applicant',
      mustChangePassword,
    } as unknown as AuthService;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    });
    const router = TestBed.inject(Router);
    const result = TestBed.runInInjectionContext(() => authGuard({} as never, { url } as never)) as
      true | UrlTree;
    return result === true ? true : router.serializeUrl(result);
  }

  it('keeps an applicant inside the application area', () => {
    expect(guardFor('/application')).toBe(true);
    expect(guardFor('/application/edit')).toBe(true);
    expect(guardFor('/dashboard')).toBe('/application');
    expect(guardFor('/payments')).toBe('/application');
  });

  it('forces a temporary password to be changed first', () => {
    expect(guardFor('/application/edit', true)).toBe('/application/change-password');
    expect(guardFor('/application/change-password', true)).toBe(true);
  });
});

describe('CorrectionFieldsPickerComponent', () => {
  it('emits a new array in canonical order without mutating the input', () => {
    TestBed.resetTestingModule();
    const fixture = TestBed.configureTestingModule({
      imports: [CorrectionFieldsPickerComponent],
      providers: [provideTranslateService()],
    }).createComponent(CorrectionFieldsPickerComponent);
    const initial = ['documents'] as const;
    fixture.componentRef.setInput('value', initial);
    const emitted: string[][] = [];
    fixture.componentInstance.valueChange.subscribe((v) => emitted.push(v));

    fixture.componentInstance.toggle('nid');
    fixture.componentRef.setInput('value', emitted[0]);
    fixture.componentInstance.toggle('documents');

    expect(emitted[0]).toEqual(['nid', 'documents']);
    expect(emitted[1]).toEqual(['nid']);
    expect(initial).toEqual(['documents']);
  });
});
