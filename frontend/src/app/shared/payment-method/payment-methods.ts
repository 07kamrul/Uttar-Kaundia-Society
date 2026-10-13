import {
  MFS_PAYMENT_METHODS,
  ORG_BANK_INFO,
  ORG_MFS_INFO,
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

/** Society account details for a method: from the server, else the built-in ones. */
export function accountsForMethod(method: string, serverAccounts: readonly PaymentAccount[]): PaymentAccount[] {
  const wanted = method.toLowerCase();
  const fromServer = serverAccounts.filter((a) => a.method.toLowerCase() === wanted);
  if (fromServer.length > 0) return fromServer;
  if (MFS_PAYMENT_METHODS.includes(wanted)) {
    return [
      {
        method,
        label: `${ORG_MFS_INFO.number} (${ORG_MFS_INFO.type})`,
        number: ORG_MFS_INFO.number,
        accountName: null,
      },
    ];
  }
  if (wanted === 'bank') {
    return [
      {
        method,
        label: `${ORG_BANK_INFO.bankName}, ${ORG_BANK_INFO.branch} — ${ORG_BANK_INFO.accountName}, ${ORG_BANK_INFO.accountNumber}`,
        number: ORG_BANK_INFO.accountNumber,
        accountName: ORG_BANK_INFO.accountName,
      },
    ];
  }
  return [];
}
