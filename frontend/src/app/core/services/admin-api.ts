// Admin API wire types and wire→domain mappers (extracted from admin.service.ts).
import { environment } from '../../../environments/environment';
import type {
  ApplicableDoc,
  AuditLogEntry,
  ConfigListItem,
  FeeSetting,
  Member,
  MemberProfile,
  Nominee,
  SubmissionDetail,
  SubmissionProperty,
  SubmissionStatus,
  SubmissionSummary,
} from '../models/admin.model';
import { getMediaToken } from './media-token.service';

export type AttachmentKind = 'member_photo' | 'receipt_photo';

/** Outcome of a rejection: the submission is rejected either way, but the
 * applicant is only notified when `emailSent` is true. */
export interface RejectResult {
  emailSent: boolean;
}

/** Fields a notice is created/edited with. Dates are ISO instants (UTC). */
export interface NoticeInput {
  title: string;
  body: string;
  categoryId?: string | null;
  isPublished?: boolean;
  isMembersOnly?: boolean;
  publishAt?: string | null;
}

/** Fields an event is created/edited with. Dates are ISO instants (UTC). */
export interface EventInput {
  title: string;
  description?: string | null;
  location?: string | null;
  categoryId?: string | null;
  startAt: string;
  endAt?: string | null;
  isPublished?: boolean;
  isMembersOnly?: boolean;
}

export interface MemberApiModel {
  id: number;
  member_id: string | null;
  status: SubmissionStatus;
  full_name: string;
  mobile: string;
  email?: string;
  due_installments: number;
}

export interface FeeSettingApiModel {
  id: number;
  key: string;
  value: number;
  unit?: string | null;
  start_date: string;
  end_date?: string | null;
  status: number;
}

export interface ConfigListItemApiModel {
  id: number;
  category: string;
  value: string;
  label: string;
  sort_order: number;
  is_active: number;
}

export interface AuditLogApiModel {
  id: number;
  actor_admin_id: number | null;
  action: string;
  entity_type: string;
  entity_id: string;
  detail: string | null;
  created_at: string;
}

export function toAuditLogEntry(api: AuditLogApiModel): AuditLogEntry {
  return {
    id: String(api.id),
    actorAdminId: api.actor_admin_id !== null ? String(api.actor_admin_id) : null,
    action: api.action,
    entityType: api.entity_type,
    entityId: api.entity_id,
    detail: api.detail,
    createdAt: api.created_at,
  };
}

export interface SubmissionSummaryApiModel {
  id: number;
  member_id: string | null;
  status: SubmissionStatus;
  full_name: string;
  mobile: string;
  created_at: string;
  needs_dag?: boolean;
}

export interface ApplicableDocApiModel {
  id: number;
  doc_type: string;
  file_path: string | null;
}

export interface SubmissionPropertyApiModel {
  id: number;
  property_type: string[];
  property_type_other: string | null;
  khatian_no: string | null;
  dag_no_cs: string | null;
  dag_no_rs: string | null;
  holding_number: string | null;
  land_quantity: string | null;
  my_share_quantity: string | null;
  ownership: string | null;
  joint_owner_count: number | null;
  dag_unknown?: boolean;
  applicable_docs: ApplicableDocApiModel[];
}

export interface NomineeApiModel {
  id: number;
  name: string;
  relation: string;
  mobile: string;
  address: string | null;
}

export interface SubmissionDetailApiModel {
  id: number;
  member_id: string | null;
  status: SubmissionStatus;
  full_name: string;
  mobile: string;
  created_at: string;
  father_or_husband: string;
  mother: string;
  dob: string;
  nationality: string;
  occupation: string;
  nid: string;
  gender: string;
  email: string;
  permanent_house: string | null;
  permanent_road: string | null;
  permanent_post_office: string | null;
  permanent_upazila: string | null;
  permanent_district: string | null;
  permanent_division: string | null;
  current_house: string | null;
  current_road: string | null;
  current_post_office: string | null;
  current_upazila: string | null;
  current_district: string | null;
  current_division: string | null;
  urgent_contact_name: string | null;
  urgent_contact_relation: string | null;
  urgent_contact_mobile: string | null;
  urgent_contact_address: string | null;
  admission_fee: string;
  subscription: string;
  receipt_no: string;
  payment_method: string;
  payment_account_snapshot: string | null;
  member_signature: string | null;
  member_photo_path: string | null;
  receipt_photo_path: string | null;
  rejection_reason: string | null;
  notification_status?: 'sent' | 'failed' | null;
  needs_dag?: boolean;
  properties: SubmissionPropertyApiModel[];
  nominees: NomineeApiModel[];
}

export function toMember(api: MemberApiModel): Member {
  return {
    id: String(api.id),
    memberId: api.member_id,
    status: api.status,
    fullName: api.full_name,
    mobile: api.mobile,
    email: api.email,
    dueInstallments: api.due_installments,
  };
}

export function toFeeSetting(api: FeeSettingApiModel): FeeSetting {
  return {
    id: String(api.id),
    key: api.key,
    value: api.value,
    unit: api.unit ?? undefined,
    startDate: api.start_date,
    endDate: api.end_date ?? undefined,
    status: api.status,
  };
}

export type FeeTypeCalculationType = 'fixed' | 'tiered' | 'head_additional' | 'variable';

export interface AdminFeeTypeCurrentVersion {
  values: Record<string, number>;
  unit?: string | null;
  startDate: string;
}

export interface AdminFeeType {
  key: string;
  labelBn: string;
  labelEn: string;
  calculationType: FeeTypeCalculationType;
  unit: string;
  isRecurring: boolean;
  isPayOnce: boolean;
  feeCategory: 'installment' | 'other';
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  currentVersion: AdminFeeTypeCurrentVersion | null;
  paymentCount: number;
}

export interface AdminFeeTypeVersion {
  startDate: string;
  endDate: string | null;
  status: number;
  values: Record<string, number>;
}

export interface FeeTypeCalculation {
  calculationType: string;
  total: number | null;
  breakdown: Record<string, number | null>;
}

export interface AdminFeeTypeApiModel {
  key: string;
  label_bn: string;
  label_en: string;
  calculation_type: FeeTypeCalculationType;
  unit: string;
  is_recurring: boolean;
  is_pay_once: boolean;
  fee_category: 'installment' | 'other';
  is_active: boolean;
  sort_order: number;
  created_at: string;
  current_version: {
    values: Record<string, number>;
    unit: string | null;
    start_date: string;
  } | null;
  payment_count: number;
}

export function toFeeType(api: AdminFeeTypeApiModel): AdminFeeType {
  return {
    key: api.key,
    labelBn: api.label_bn,
    labelEn: api.label_en,
    calculationType: api.calculation_type,
    unit: api.unit,
    isRecurring: api.is_recurring,
    isPayOnce: api.is_pay_once,
    feeCategory: api.fee_category,
    isActive: api.is_active,
    sortOrder: api.sort_order,
    createdAt: api.created_at,
    currentVersion: api.current_version
      ? {
          values: api.current_version.values,
          unit: api.current_version.unit,
          startDate: api.current_version.start_date,
        }
      : null,
    paymentCount: api.payment_count,
  };
}

export interface AdminFeeTypeVersionApiModel {
  start_date: string;
  end_date: string | null;
  status: number;
  values: Record<string, number>;
}

export interface FeeTypeCalculationApiModel {
  calculation_type: string;
  total: number | string | null;
  breakdown: Record<string, number | null>;
}

export function toConfigListItem(api: ConfigListItemApiModel): ConfigListItem {
  return {
    id: String(api.id),
    category: api.category,
    value: api.value,
    label: api.label,
    sortOrder: api.sort_order,
    isActive: api.is_active === 1,
  };
}

export function toSubmissionSummary(api: SubmissionSummaryApiModel): SubmissionSummary {
  return {
    id: String(api.id),
    fullName: api.full_name,
    mobile: api.mobile,
    status: api.status,
    createdAt: api.created_at,
    needsDag: !!api.needs_dag,
  };
}

/** `temporary_password` is only present when the email could not be sent. */
export interface ResetPasswordResult {
  member_id: string;
  email_sent: boolean;
  temporary_password?: string | null;
}

/** Origin the backend serves `/uploads/*` static files from (apiBaseUrl without the `/api` suffix). */
export const uploadsOrigin = environment.apiBaseUrl.replace(/\/api\/?$/, '');

/**
 * Absolute URL for a stored relative upload path.
 *
 * Every path segment is percent-encoded individually: stored paths can contain
 * Bengali labels and spaces (`documents/member_1/খাজনা-কর রশিদ/x.pdf`), and
 * leaving encoding to the browser silently breaks on `#`, `?` and `%`.
 */
export function toFileUrl(relativePath: string | null): string | undefined {
  if (!relativePath) return undefined;
  const encoded = relativePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  // /uploads is private: the backend requires the short-lived media token.
  const token = getMediaToken();
  const query = token ? `?t=${encodeURIComponent(token)}` : '';
  return `${uploadsOrigin}/uploads/${encoded}${query}`;
}

export function toApplicableDoc(api: ApplicableDocApiModel): ApplicableDoc {
  return { id: String(api.id), docType: api.doc_type, fileUrl: toFileUrl(api.file_path) ?? null };
}

export function toSubmissionProperty(api: SubmissionPropertyApiModel): SubmissionProperty {
  return {
    id: String(api.id),
    propertyType: api.property_type,
    propertyTypeOther: api.property_type_other,
    khatianNo: api.khatian_no,
    dagNoCs: api.dag_no_cs,
    dagNoRs: api.dag_no_rs,
    holdingNumber: api.holding_number,
    landQuantity: api.land_quantity,
    myShareQuantity: api.my_share_quantity,
    ownership: api.ownership,
    jointOwnerCount: api.joint_owner_count,
    dagUnknown: !!api.dag_unknown,
    applicableDocs: api.applicable_docs.map(toApplicableDoc),
  };
}

export function toNominee(api: NomineeApiModel): Nominee {
  return {
    id: String(api.id),
    name: api.name,
    relation: api.relation,
    mobile: api.mobile,
    address: api.address,
  };
}

export function toSubmissionDetail(api: SubmissionDetailApiModel): SubmissionDetail {
  return {
    id: String(api.id),
    fullName: api.full_name,
    mobile: api.mobile,
    status: api.status,
    createdAt: api.created_at,
    fatherOrHusband: api.father_or_husband,
    mother: api.mother,
    dob: api.dob,
    nationality: api.nationality,
    occupation: api.occupation,
    nid: api.nid,
    gender: api.gender,
    email: api.email,
    permanentHouse: api.permanent_house ?? undefined,
    permanentRoad: api.permanent_road ?? undefined,
    permanentPostOffice: api.permanent_post_office ?? undefined,
    permanentUpazila: api.permanent_upazila ?? undefined,
    permanentDistrict: api.permanent_district ?? undefined,
    permanentDivision: api.permanent_division ?? undefined,
    currentHouse: api.current_house ?? undefined,
    currentRoad: api.current_road ?? undefined,
    currentPostOffice: api.current_post_office ?? undefined,
    currentUpazila: api.current_upazila ?? undefined,
    currentDistrict: api.current_district ?? undefined,
    currentDivision: api.current_division ?? undefined,
    urgentContactName: api.urgent_contact_name ?? undefined,
    urgentContactRelation: api.urgent_contact_relation ?? undefined,
    urgentContactMobile: api.urgent_contact_mobile ?? undefined,
    urgentContactAddress: api.urgent_contact_address ?? undefined,
    properties: api.properties.map(toSubmissionProperty),
    nominees: api.nominees.map(toNominee),
    admissionFee: api.admission_fee,
    subscription: api.subscription,
    receiptNo: api.receipt_no,
    paymentMethod: api.payment_method,
    paymentAccountSnapshot: api.payment_account_snapshot,
    memberPhotoUrl: toFileUrl(api.member_photo_path),
    memberSignature: api.member_signature ?? undefined,
    receiptPhotoUrl: toFileUrl(api.receipt_photo_path),
    rejectionReason: api.rejection_reason ?? undefined,
    notificationStatus: api.notification_status ?? undefined,
    needsDag: !!api.needs_dag,
  };
}

export interface MemberProfileApiModel extends SubmissionDetailApiModel {
  updated_at: string;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  fee_summary: { due_count: number; paid_count: number; due_total: number; paid_total: number };
  installments: {
    id: number;
    year: number;
    month: number;
    amount: number;
    status: 'paid' | 'due';
    paid_at: string | null;
  }[];
  picnic_payments: {
    id: number;
    total: number;
    additional_count: number;
    payment_date: string;
    receipt_no: string | null;
    payment_method: string | null;
  }[];
  audit_trail: {
    id: number;
    action: string;
    detail: string | null;
    actor_name: string | null;
    created_at: string;
  }[];
}

export function toMemberProfile(api: MemberProfileApiModel): MemberProfile {
  return {
    ...toSubmissionDetail(api),
    memberId: api.member_id,
    updatedAt: api.updated_at,
    reviewedAt: api.reviewed_at ?? undefined,
    reviewedByName: api.reviewed_by_name ?? undefined,
    feeSummary: {
      dueCount: api.fee_summary.due_count,
      paidCount: api.fee_summary.paid_count,
      dueTotal: api.fee_summary.due_total,
      paidTotal: api.fee_summary.paid_total,
    },
    installments: api.installments.map((row) => ({
      id: String(row.id),
      year: row.year,
      month: row.month,
      amount: row.amount,
      status: row.status,
      paidAt: row.paid_at ?? undefined,
    })),
    picnicPayments: api.picnic_payments.map((row) => ({
      id: row.id,
      total: row.total,
      additionalCount: row.additional_count,
      paymentDate: row.payment_date,
      receiptNo: row.receipt_no,
      paymentMethod: row.payment_method,
    })),
    auditTrail: api.audit_trail.map((row) => ({
      id: row.id,
      action: row.action,
      detail: row.detail,
      actorName: row.actor_name,
      createdAt: row.created_at,
    })),
  };
}

export interface PicnicPaymentsPageApiModel {
  items: {
    id: number;
    member_id: number;
    member_name: string | null;
    head_price: number;
    additional_price: number;
    additional_count: number;
    total: number;
    payment_date: string;
    receipt_no: string | null;
    payment_method: string | null;
  }[];
  total_collected: number;
  count: number;
}

export interface AdminPicnicPayment {
  id: number;
  memberId: number;
  memberName: string | null;
  headPrice: number;
  additionalPrice: number;
  additionalCount: number;
  total: number;
  paymentDate: string;
  receiptNo: string | null;
  paymentMethod: string | null;
}

export interface PicnicPaymentsPage {
  items: AdminPicnicPayment[];
  totalCollected: number;
  count: number;
}

export interface FeePaymentsPageApiModel {
  items: {
    id: number;
    member_id: number;
    member_name: string | null;
    fee_type: string;
    amount: string | number;
    payment_date: string;
    receipt_no: string | null;
    payment_method: string | null;
    note: string | null;
    additional_heads: number | null;
    source: string;
  }[];
  total: number;
  page: number;
  page_size: number;
  summary: { total_paid: number; by_type: Record<string, number> };
}

export interface AdminFeePayment {
  id: number;
  memberId: number;
  memberName: string | null;
  feeType: string;
  amount: number;
  paymentDate: string;
  receiptNo: string | null;
  paymentMethod: string | null;
  note: string | null;
  additionalHeads: number | null;
  source: string;
}

export interface FeePaymentsPage {
  items: AdminFeePayment[];
  totalCollected: number;
  count: number;
  page: number;
  pageSize: number;
  byType: Record<string, number>;
}
