/**
 * Review rounds of a membership application and the form sections a
 * reviewer can flag for correction. Mirrors
 * backend/app/services/applicant_access.py CORRECTION_FIELDS.
 */

export type CorrectionField =
  | 'personal_info'
  | 'photo'
  | 'nid'
  | 'contact'
  | 'address'
  | 'properties'
  | 'documents'
  | 'nominees'
  | 'urgent_contact'
  | 'payment'
  | 'signature';

export interface CorrectionFieldInfo {
  key: CorrectionField;
  /** i18n key under `application.fields.*`. */
  labelKey: string;
  /** Registration wizard step (1-based) where the field is edited. */
  step: number;
}

const WIZARD_STEP = {
  member: 1,
  property: 2,
  contact: 3,
  payment: 4,
  declaration: 5,
} as const;

export const CORRECTION_FIELDS: readonly CorrectionFieldInfo[] = [
  { key: 'personal_info', labelKey: 'application.fields.personal_info', step: WIZARD_STEP.member },
  { key: 'photo', labelKey: 'application.fields.photo', step: WIZARD_STEP.member },
  { key: 'nid', labelKey: 'application.fields.nid', step: WIZARD_STEP.member },
  { key: 'contact', labelKey: 'application.fields.contact', step: WIZARD_STEP.member },
  { key: 'address', labelKey: 'application.fields.address', step: WIZARD_STEP.member },
  { key: 'properties', labelKey: 'application.fields.properties', step: WIZARD_STEP.property },
  { key: 'documents', labelKey: 'application.fields.documents', step: WIZARD_STEP.property },
  { key: 'nominees', labelKey: 'application.fields.nominees', step: WIZARD_STEP.contact },
  {
    key: 'urgent_contact',
    labelKey: 'application.fields.urgent_contact',
    step: WIZARD_STEP.contact,
  },
  { key: 'payment', labelKey: 'application.fields.payment', step: WIZARD_STEP.payment },
  { key: 'signature', labelKey: 'application.fields.signature', step: WIZARD_STEP.declaration },
];

const FIELD_BY_KEY = new Map(CORRECTION_FIELDS.map((f) => [f.key, f]));

export function correctionFieldInfo(key: string): CorrectionFieldInfo | undefined {
  return FIELD_BY_KEY.get(key as CorrectionField);
}

/** Lowest wizard step holding any flagged field; null when nothing is flagged. */
export function firstStepToCorrect(fields: readonly string[]): number | null {
  const steps = fields
    .map((key) => correctionFieldInfo(key)?.step)
    .filter((step): step is number => step !== undefined);
  return steps.length ? Math.min(...steps) : null;
}

export type ReviewDecision = 'rejected' | 'approved';

export interface ApplicationReview {
  id: string;
  round: number;
  decision: ReviewDecision;
  reason: string | null;
  correctionFields: CorrectionField[];
  createdAt: string;
}

export interface ApplicationReviewApi {
  id: number;
  round: number;
  decision: ReviewDecision;
  reason: string | null;
  correction_fields: string[];
  created_at: string;
}

export function toApplicationReview(api: ApplicationReviewApi): ApplicationReview {
  return {
    id: String(api.id),
    round: api.round,
    decision: api.decision,
    reason: api.reason,
    // Unknown keys (a newer backend) are dropped rather than shown raw.
    correctionFields: api.correction_fields.filter((key): key is CorrectionField =>
      FIELD_BY_KEY.has(key as CorrectionField),
    ),
    createdAt: api.created_at,
  };
}
