import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, type Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { SubmissionDetailApiModel } from '../../core/services/admin-api';
import { toFileUrl } from '../../core/services/admin-api';
import { RegistrationService } from '../../core/services/registration.service';
import type { FormDataModel } from '../../core/models/registration.model';
import type { SubmissionStatus } from '../../core/models/admin.model';
import {
  correctionFieldInfo,
  toApplicationReview,
  type ApplicationReview,
  type ApplicationReviewApi,
  type CorrectionField,
} from '../../core/models/application-review.model';
import { storedFileName, toStoredFileValue } from '../../core/utils/stored-file';

/** Detail fields the applicant API returns beyond the admin detail model. */
export interface ApplicantDetailApi extends SubmissionDetailApiModel {
  has_whatsapp?: boolean | null;
  current_address_abroad?: boolean;
  current_country?: string | null;
  current_city?: string | null;
  current_address_text?: string | null;
  payment_account_id?: number | null;
  submission_date?: string;
}

interface ApplicantApplicationApi {
  application: ApplicantDetailApi;
  can_edit: boolean;
  rejection_reason: string | null;
  correction_fields: string[];
  reviews: ApplicationReviewApi[];
}

export interface ApplicantApplication {
  id: string;
  fullName: string;
  email: string;
  status: SubmissionStatus;
  canEdit: boolean;
  rejectionReason: string | null;
  correctionFields: CorrectionField[];
  reviews: ApplicationReview[];
  resubmissionCount: number;
  photoUrl: string | null;
  /** Plain form value for the registration wizard, files as `stored:` markers. */
  formValue: Record<string, unknown>;
}

export interface ResubmitResult {
  status: SubmissionStatus;
  resubmissionCount: number;
}

type AddressPrefix = 'permanent' | 'current';
const ADDRESS_KEYS = ['house', 'road', 'post_office', 'upazila', 'district', 'division'] as const;

function addressValue(api: ApplicantDetailApi, prefix: AddressPrefix): Record<string, string> {
  const source = api as unknown as Record<string, string | null | undefined>;
  const read = (key: (typeof ADDRESS_KEYS)[number]): string => source[`${prefix}_${key}`] ?? '';
  return {
    house: read('house'),
    road: read('road'),
    postOffice: read('post_office'),
    upazila: read('upazila'),
    district: read('district'),
    division: read('division'),
  };
}

function storedOrEmpty(path: string | null | undefined): string {
  return path ? toStoredFileValue(path) : '';
}

function propertyValue(p: SubmissionDetailApiModel['properties'][number]): Record<string, unknown> {
  return {
    propertyType: p.property_type ?? [],
    propertyTypeOther: p.property_type_other ?? '',
    khatianNo: p.khatian_no ?? '',
    dagUnknown: p.dag_unknown ?? false,
    dagNo: { cs: p.dag_no_cs ?? '', rs: p.dag_no_rs ?? '' },
    holdingNumber: p.holding_number ?? '',
    landQuantity: p.land_quantity ?? '',
    myShareQuantity: p.my_share_quantity ?? '',
    ownership: p.ownership ?? '',
    jointOwnerCount: p.joint_owner_count,
    applicableDocs: p.applicable_docs.map((d) => ({
      type: d.doc_type,
      fileName: d.file_path ? storedFileName(d.file_path) : '',
      fileDataUrl: storedOrEmpty(d.file_path),
    })),
  };
}

/** API detail -> registration wizard form value (camelCase, stored files). */
export function toApplicationFormValue(api: ApplicantDetailApi): Record<string, unknown> {
  return {
    fullName: api.full_name,
    fatherOrHusband: api.father_or_husband,
    mother: api.mother,
    dob: api.dob,
    nationality: api.nationality,
    occupation: api.occupation,
    nid: api.nid,
    mobile: api.mobile,
    gender: api.gender,
    email: api.email,
    hasWhatsapp: api.has_whatsapp ?? false,
    permanentAddress: addressValue(api, 'permanent'),
    currentAddress: addressValue(api, 'current'),
    currentAddressAbroad: api.current_address_abroad ?? false,
    currentCountry: api.current_country ?? '',
    currentCity: api.current_city ?? '',
    currentAddressText: api.current_address_text ?? '',
    urgentContactName: api.urgent_contact_name ?? '',
    urgentContactRelation: api.urgent_contact_relation ?? '',
    urgentContactMobile: api.urgent_contact_mobile ?? '',
    urgentContactAddress: api.urgent_contact_address ?? '',
    propertyCount: api.properties.length || null,
    properties: api.properties.map(propertyValue),
    nominees: api.nominees.map((n) => ({
      name: n.name,
      relation: n.relation,
      mobile: n.mobile,
      address: n.address ?? '',
    })),
    admissionFee: api.admission_fee,
    subscription: api.subscription,
    receiptNo: api.receipt_no,
    paymentMethod: api.payment_method,
    paymentAccountId: api.payment_account_id ?? null,
    receiptFileName: api.receipt_photo_path ? storedFileName(api.receipt_photo_path) : '',
    receiptFileDataUrl: storedOrEmpty(api.receipt_photo_path),
    memberSignature: api.member_signature ?? '',
    submissionDate: api.submission_date ?? new Date().toISOString().split('T')[0],
    memberPhoto: storedOrEmpty(api.member_photo_path),
    // The applicant re-confirms the declaration on every resubmission.
    declarationAccepted: false,
  };
}

function toApplicantApplication(res: ApplicantApplicationApi): ApplicantApplication {
  const app = res.application;
  return {
    id: String(app.id),
    fullName: app.full_name,
    email: app.email,
    status: app.status,
    canEdit: res.can_edit,
    rejectionReason: res.rejection_reason,
    correctionFields: res.correction_fields.filter(
      (key): key is CorrectionField => !!correctionFieldInfo(key),
    ),
    reviews: res.reviews.map(toApplicationReview),
    resubmissionCount: app.resubmission_count ?? 0,
    photoUrl: toFileUrl(app.member_photo_path) ?? null,
    formValue: toApplicationFormValue(app),
  };
}

/** The rejected applicant's own application: read, correct, resubmit. */
@Injectable({ providedIn: 'root' })
export class ApplicantService {
  private readonly http = inject(HttpClient);
  private readonly registration = inject(RegistrationService);
  private readonly base = `${environment.apiBaseUrl}/applicant/application`;

  getApplication(): Observable<ApplicantApplication> {
    return this.http.get<ApplicantApplicationApi>(this.base).pipe(map(toApplicantApplication));
  }

  /** Save corrections to the same record (only new uploads are sent as files). */
  update(formData: FormDataModel): Observable<ApplicantApplication> {
    return this.http
      .put<ApplicantApplicationApi>(this.base, this.registration.buildMultipart(formData))
      .pipe(map(toApplicantApplication));
  }

  resubmit(): Observable<ResubmitResult> {
    return this.http
      .post<{ status: SubmissionStatus; resubmission_count: number }>(`${this.base}/resubmit`, {})
      .pipe(map((res) => ({ status: res.status, resubmissionCount: res.resubmission_count })));
  }
}
