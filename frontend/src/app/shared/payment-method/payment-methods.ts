import {
  MFS_PAYMENT_METHODS,
  type PaymentAccount,
} from '../../core/models/registration.model';

export const METHOD_ICONS: Readonly<Record<string, string>> = {
  cash: '💵',
  bkash: '📱',
  nagad: '📱',
  rocket: '📱',
  bank: '🏦',
  other: '➕',
};

/** TrxID for mobile banking, receipt number for cash, bank and other. */
export function referenceLabelKey(method: string): string {
  return MFS_PAYMENT_METHODS.includes(method)
    ? 'registration.simplified.payment.refTrx'
    : 'registration.simplified.payment.refReceipt';
}

/**
 * Active society accounts for a method key. No built-in fallback: when the
 * server has no active account the caller hides the option entirely.
 */
export function accountsForMethod(method: string, serverAccounts: readonly PaymentAccount[]): PaymentAccount[] {
  const wanted = method.toLowerCase();
  return serverAccounts.filter((a) => a.method.toLowerCase() === wanted);
}

/** Method keys that actually have an active account, in server display order. */
export function availableAccountMethods(serverAccounts: readonly PaymentAccount[]): string[] {
  const seen: string[] = [];
  for (const account of serverAccounts) {
    if (!seen.includes(account.method)) seen.push(account.method);
  }
  return seen;
}
