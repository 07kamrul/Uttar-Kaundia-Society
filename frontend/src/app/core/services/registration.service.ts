import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { SKIP_LOADER } from '../interceptors/loader-context';
import type { Observable } from 'rxjs';
import { map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { FeatureFlagService, type FeatureFlagKey } from './feature-flag.service';
import { toAsciiDigits } from './digits.helper';
import type {
  FormDataModel,
  PropertyItem,
  RegistrationConfig,
  SubmissionResult,
  SubscriptionQuote,
} from '../models/registration.model';

interface SubscriptionQuoteApiResponse {
  base: number;
  extra_units: number;
  extra_rate: number;
  extra_amount: number;
  total: number;
  unit: string;
  rate_version_effective_from: string | null;
}

interface RegistrationConfigApiResponse {
  consent_version: string;
  payment_accounts?: { method: string; label: string; number: string | null; account_name: string | null }[];
}

const DEFAULT_NATIONALITY = 'বাংলাদেশী';

type AddressInput = NonNullable<FormDataModel['currentAddress']>;

function toAddressPayload(address: AddressInput | undefined): Record<string, string> | null {
  if (!address) return null;
  return {
    house: address.house,
    road: address.road,
    post_office: address.postOffice,
    upazila: address.upazila,
    district: address.district,
    division: address.division,
  };
}

/** Digits typed on a Bangla keyboard are normalised before they reach the server. */
function ascii(value: string | null | undefined): string {
  return toAsciiDigits((value ?? '').trim());
}

// Converts a "data:<mime>;base64,..." URL (how photo/doc uploads are held
// in the form model) back into a Blob for multipart upload.
function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/data:(.*);base64/)?.[1] ?? 'application/octet-stream';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

@Injectable({ providedIn: 'root' })
export class RegistrationService {
  private readonly flags = inject(FeatureFlagService);

  constructor(private http: HttpClient) {}

  // Active fee settings keyed by their Fee Settings key (e.g. 'admission_fee').
  getPublicFeeSettings(): Observable<Record<string, number>> {
    return this.http.get<Record<string, number>>(`${environment.apiBaseUrl}/public/fee-settings`);
  }

  /** Society payment accounts and the current consent version; no auth, cached server side. */
  getRegistrationConfig(): Observable<RegistrationConfig> {
    return this.http
      .get<RegistrationConfigApiResponse>(`${environment.apiBaseUrl}/public/registration-config`, {
        context: new HttpContext().set(SKIP_LOADER, true),
      })
      .pipe(
        map((res) => ({
          consentVersion: res.consent_version,
          paymentAccounts: (res.payment_accounts ?? []).map((a) => ({
            method: a.method,
            label: a.label,
            number: a.number ?? null,
            accountName: a.account_name ?? null,
          })),
        })),
      );
  }

  // The monthly subscription (চাঁদা) amount is always backend-quoted from the
  // active tiered fee settings - never computed or hard-coded on the client.
  getSubscriptionQuote(landSizeDecimal: number): Observable<SubscriptionQuote> {
    return this.http
      .post<SubscriptionQuoteApiResponse>(
        `${environment.apiBaseUrl}/public/registration/subscription-quote`,
        { land_size_decimal: landSizeDecimal },
        // Live quote re-fetched as the user types — a blocking overlay would interrupt input.
        { context: new HttpContext().set(SKIP_LOADER, true) },
      )
      .pipe(
        map((res) => ({
          base: res.base,
          extraUnits: res.extra_units,
          extraRate: res.extra_rate,
          extraAmount: res.extra_amount,
          total: res.total,
          unit: res.unit,
          rateVersionEffectiveFrom: res.rate_version_effective_from,
        })),
      );
  }

  // Backend contract (see backend/app/api/routes/submissions.py): a single
  // 'payload' form field holding a JSON object matching SubmissionPayload
  // (snake_case, nested properties/nominees), plus an optional
  // 'member_photo' file, plus a 'doc_files' list whose order matches each
  // property's applicable_docs flattened in property order.
  submit(formData: FormDataModel): Observable<SubmissionResult> {
    const body = new FormData();

    body.append('payload', JSON.stringify(this.buildPayload(formData)));

    if (formData.memberPhoto) {
      body.append('member_photo', dataUrlToBlob(formData.memberPhoto), 'photo.jpg');
    }

    if (formData.receiptFileDataUrl) {
      body.append(
        'receipt_photo',
        dataUrlToBlob(formData.receiptFileDataUrl),
        formData.receiptFileName || 'receipt.jpg',
      );
    }

    for (const property of formData.properties) {
      for (const doc of property.applicableDocs) {
        // Same filter as the payload's applicable_docs, so order stays aligned.
        if (doc.fileDataUrl) {
          body.append('doc_files', dataUrlToBlob(doc.fileDataUrl), doc.fileName || 'document');
        }
      }
    }

    return this.http.post<SubmissionResult>(`${environment.apiBaseUrl}/submissions`, body);
  }

  private isOn(key: FeatureFlagKey): boolean {
    return this.flags.isEnabled(key);
  }

  private buildPayload(formData: FormDataModel): Record<string, unknown> {
    const abroad = this.isOn('reg_abroad_address') && formData.currentAddressAbroad === true;
    const payload: Record<string, unknown> = {
      full_name: formData.fullName,
      father_or_husband: formData.fatherOrHusband,
      mother: formData.mother,
      dob: formData.dob,
      nationality:
        this.isOn('reg_hide_nationality') && !formData.nationality?.trim()
          ? DEFAULT_NATIONALITY
          : formData.nationality,
      occupation:
        this.isOn('reg_occupation_optional') && !formData.occupation?.trim()
          ? null
          : formData.occupation,
      nid: ascii(formData.nid),
      mobile: formData.mobile,
      gender: formData.gender,
      email: formData.email,
      permanent_address: toAddressPayload(formData.permanentAddress),
      current_address: abroad ? null : toAddressPayload(formData.currentAddress),
      urgent_contact_name: formData.urgentContactName,
      urgent_contact_relation: formData.urgentContactRelation,
      urgent_contact_mobile: formData.urgentContactMobile,
      urgent_contact_address: formData.urgentContactAddress,
      admission_fee: String(formData.admissionFee ?? ''),
      subscription: String(formData.subscription ?? ''),
      receipt_no: formData.receiptNo,
      payment_method: formData.paymentMethod,
      member_signature: formData.memberSignature,
      submission_date: formData.submissionDate,
      properties: formData.properties.map((property) => this.propertyPayload(property)),
      nominees: formData.nominees,
    };
    if (abroad) {
      payload['current_address_abroad'] = true;
      payload['current_country'] = formData.currentCountry;
      payload['current_city'] = formData.currentCity?.trim();
      payload['current_address_text'] = formData.currentAddressText?.trim();
    }
    if (this.isOn('reg_simplified_ui')) {
      payload['has_whatsapp'] = formData.hasWhatsapp ?? null;
      if (formData.consentVersion) payload['consent_version'] = formData.consentVersion;
    }
    return payload;
  }

  private propertyPayload(property: PropertyItem): Record<string, unknown> {
    // With "at least one proof", slots without a file are not documents at all.
    const docs = this.isOn('reg_min_one_proof')
      ? property.applicableDocs.filter((doc) => !!doc.fileDataUrl)
      : property.applicableDocs;
    const payload: Record<string, unknown> = {
      property_type: property.propertyType,
      property_type_other: property.propertyTypeOther,
      khatian_no: ascii(property.khatianNo),
      dag_no_cs: ascii(property.dagNo.cs),
      dag_no_rs: ascii(property.dagNo.rs),
      holding_number: property.holdingNumber,
      land_quantity: ascii(property.landQuantity),
      my_share_quantity: ascii(property.myShareQuantity),
      ownership: property.ownership,
      joint_owner_count: property.ownership === 'যৌথ' ? property.jointOwnerCount : null,
      applicable_docs: docs.map((doc) => ({ doc_type: doc.type })),
    };
    if (this.isOn('reg_dag_unknown')) payload['dag_unknown'] = property.dagUnknown === true;
    return payload;
  }
}
