export interface Nominee {
  name: string;
  relation: string;
  mobile: string;
  address: string;
}

export interface AddressDetail {
  house: string;
  road: string;
  postOffice: string;
  upazila: string;
  district: string;
  division: string;
}

export function createEmptyAddress(): AddressDetail {
  return { house: '', road: '', postOffice: '', upazila: '', district: '', division: '' };
}

export interface SubscriptionQuote {
  base: number;
  extraUnits: number;
  extraRate: number;
  extraAmount: number;
  total: number;
  unit: string;
  rateVersionEffectiveFrom: string | null;
}

export interface ApplicableDocEntry {
  type: string;
  fileName: string;
  fileDataUrl: string;
  driveUrl?: string;
}

export interface DagNo {
  cs: string;
  rs: string;
}

export interface PropertyItem {
  propertyType: string[];
  propertyTypeOther: string;
  khatianNo: string;
  dagNo: DagNo;
  holdingNumber: string;
  landQuantity: string;
  myShareQuantity: string;
  ownership: string;
  jointOwnerCount: number | null;
  /** Member does not know the dag; the office fills it in before approval (reg_dag_unknown). */
  dagUnknown?: boolean;
  applicableDocs: ApplicableDocEntry[];
}

export const DOCUMENT_OPTIONS: string[] = [
  'খতিয়ান/পর্চা',
  'নামজারি/মিউটেশন',
  'খাজনা/কর রশিদ',
  'উত্তরাধিকার সনদ',
];

export const PROPERTY_TYPES: string[] = ['জমি', 'বাড়ি', 'ফ্ল্যাট', 'প্লট', 'অন্যান্য'];
export const OWNERSHIP_TYPES: string[] = ['একক', 'যৌথ'];

// Stored values are Bangla; these map each to a label key under
// registration.property.typeOptions / .ownershipOptions for display.
export const PROPERTY_TYPE_LABEL_KEYS: Record<string, string> = {
  জমি: 'land',
  বাড়ি: 'house',
  ফ্ল্যাট: 'flat',
  প্লট: 'plot',
  অন্যান্য: 'other',
};
export const OWNERSHIP_LABEL_KEYS: Record<string, string> = {
  একক: 'single',
  যৌথ: 'joint',
};
/** Canonical payment method keys accepted by the server (reg_simplified_ui). */
export const PAYMENT_METHOD_KEYS = ['cash', 'bkash', 'nagad', 'rocket', 'bank', 'other'] as const;
export type PaymentMethodKey = (typeof PAYMENT_METHOD_KEYS)[number];
/** Methods whose reference is a mobile-banking TrxID rather than a paper receipt number. */
export const MFS_PAYMENT_METHODS: readonly string[] = ['bkash', 'nagad', 'rocket'];

/** One society account (bank account or MFS number) members pay into.
 * Maps backend GET /payment-accounts (PaymentAccountPublicOut) to camelCase. */
export interface PaymentAccount {
  id: number;
  type: 'bank' | 'mfs';
  /** Derived key: bank | bkash | nagad | rocket | other. */
  method: string;
  displayOrder: number;
  label: string;
  bankName: string | null;
  branchName: string | null;
  accountName: string | null;
  accountNumber: string | null;
  routingNumber: string | null;
  provider: string | null;
  mfsNumber: string | null;
  accountKind: string | null;
  accountHolder: string | null;
  instructions: string | null;
  qrImageUrl: string | null;
}

/** The number a member copies to send money — the account's single identifier. */
export function accountCopyNumber(account: PaymentAccount): string {
  return account.type === 'bank' ? (account.accountNumber ?? '') : (account.mfsNumber ?? '');
}

/** Short human summary for list rows / receipts (number masked here is fine). */
export function accountDisplayLabel(account: PaymentAccount): string {
  if (account.type === 'bank') {
    return [account.bankName, account.branchName, account.accountName].filter(Boolean).join(', ');
  }
  const kindKey = account.accountKind ? `paymentAccounts.kinds.${account.accountKind}` : '';
  return [account.provider?.toUpperCase(), kindKey].filter(Boolean).join(' ');
}

/** GET /public/registration-config, mapped to camelCase. */
export interface RegistrationConfig {
  consentVersion: string;
  paymentAccounts: PaymentAccount[];
}

export const ALLOWED_DOC_MIME_TYPES: string[] = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/pdf',
];

export const MAX_DOC_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
export const MAX_PROPERTY_COUNT = 9;

export function createEmptyApplicableDoc(type: string): ApplicableDocEntry {
  return { type, fileName: '', fileDataUrl: '' };
}

export function createEmptyProperty(): PropertyItem {
  return {
    propertyType: [],
    propertyTypeOther: '',
    khatianNo: '',
    dagNo: { cs: '', rs: '' },
    holdingNumber: '',
    landQuantity: '',
    myShareQuantity: '',
    ownership: '',
    jointOwnerCount: null,
    applicableDocs: [],
  };
}

export function createEmptyNominee(): Nominee {
  return { name: '', relation: '', mobile: '', address: '' };
}

export interface FormDataModel {
  fullName: string;
  fatherOrHusband: string;
  mother: string;
  dob: string;
  nationality: string;
  occupation: string;
  nid: string;
  mobile: string;
  gender: string;
  email: string;
  permanentAddress?: AddressDetail;
  currentAddress?: AddressDetail;
  urgentContactName?: string;
  urgentContactRelation?: string;
  urgentContactMobile?: string;
  urgentContactAddress?: string;
  propertyCount: number;
  properties: PropertyItem[];
  nominees: Nominee[];
  admissionFee: string;
  subscription: string;
  receiptNo: string;
  paymentMethod: string;
  /** The society account the applicant paid into (required for bank/MFS). */
  paymentAccountId?: number | null;
  receiptFileName?: string;
  receiptFileDataUrl?: string;
  memberSignature: string;
  submissionDate: string;
  memberPhoto?: string;
  declarationAccepted?: boolean;
  hasWhatsapp?: boolean | null;
  currentAddressAbroad?: boolean;
  currentCountry?: string;
  currentCity?: string;
  currentAddressText?: string;
  consentVersion?: string;
}

export interface SubmissionResult {
  // Body of the 201 response from POST /submissions — no `success` flag;
  // HTTP status carries the outcome.
  id?: number;
  status?: string;
}
