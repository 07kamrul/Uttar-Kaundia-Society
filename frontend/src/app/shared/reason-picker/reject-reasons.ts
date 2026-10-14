/** Config-list categories holding the canned reject reasons (admin-editable under Config Lists). */
export const REASON_CATEGORY = {
  payment: 'reject_reason_payment',
  application: 'reject_reason_application',
  propertyRequest: 'reject_reason_property_request',
  boundary: 'reject_reason_boundary',
} as const;

export type ReasonCategory = (typeof REASON_CATEGORY)[keyof typeof REASON_CATEGORY];

/** Used when the config list is empty or cannot be loaded; same wording as the seeded rows. */
export const FALLBACK_REASONS: Readonly<Record<ReasonCategory, readonly string[]>> = {
  reject_reason_payment: ['TrxID মিলছে না', 'টাকার পরিমাণ মিলছে না', 'স্ক্রিনশট অস্পষ্ট', 'ডুপ্লিকেট পেমেন্ট'],
  reject_reason_application: ['কাগজপত্র অস্পষ্ট', 'খতিয়ান/দাগ মিলছে না', 'ছবি স্পষ্ট নয়', 'ডুপ্লিকেট আবেদন'],
  reject_reason_property_request: ['কাগজপত্র অস্পষ্ট', 'তথ্য মিলছে না'],
  reject_reason_boundary: ['সীমানা দাগের সাথে মিলছে না', 'অন্য সীমানার উপর পড়েছে'],
};
