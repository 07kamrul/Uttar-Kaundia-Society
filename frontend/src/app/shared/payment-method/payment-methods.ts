import {
  MFS_PAYMENT_METHODS,
  type PaymentAccount,
} from '../../core/models/registration.model';

export const METHOD_ICONS: Readonly<Record<string, string>> = {
  cash: '💵',
  mfs: '📱',
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

/** True when the key is one of the mobile financial services (bkash/nagad/rocket). */
export function isMfsMethod(method: string): boolean {
  return MFS_PAYMENT_METHODS.includes(method.toLowerCase());
}

/** MFS provider keys with at least one active account, in server display order. */
export function availableMfsMethods(serverAccounts: readonly PaymentAccount[]): string[] {
  return availableAccountMethods(serverAccounts).filter(isMfsMethod);
}

/** True when at least one active bank account exists. */
export function hasBankAccount(serverAccounts: readonly PaymentAccount[]): boolean {
  return serverAccounts.some((a) => a.type.toLowerCase() === 'bank');
}

/**
 * Top-level method cards: cash always; bank and mfs only when the server has
 * an active account of that type. The mfs card opens a provider sub-row.
 */
export function topLevelMethods(serverAccounts: readonly PaymentAccount[]): string[] {
  const methods = ['cash'];
  if (hasBankAccount(serverAccounts)) methods.push('bank');
  if (availableMfsMethods(serverAccounts).length > 0) methods.push('mfs');
  return methods;
}
