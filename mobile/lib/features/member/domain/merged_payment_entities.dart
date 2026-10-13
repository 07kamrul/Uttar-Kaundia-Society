import 'package:equatable/equatable.dart';

import 'payment_entities.dart';

/// Batch 2 merged payments (GET /member/payments/summary and /history).
/// Shapes follow docs/batch2-payments-contract.md exactly.

enum PaymentKind { installment, otherFee, costShare }

extension PaymentKindX on PaymentKind {
  /// Wire value used by the API and in `?kind=` query params.
  String get apiValue => switch (this) {
        PaymentKind.installment => 'installment',
        PaymentKind.otherFee => 'other_fee',
        PaymentKind.costShare => 'cost_share',
      };

  static PaymentKind? fromApi(String? value) => switch (value) {
        'installment' => PaymentKind.installment,
        'other_fee' => PaymentKind.otherFee,
        'cost_share' => PaymentKind.costShare,
        _ => null,
      };
}

enum PaymentItemStatus { pending, approved, rejected, recorded, unknown }

extension PaymentItemStatusX on PaymentItemStatus {
  String get apiValue => name;

  static PaymentItemStatus fromApi(String? value) => switch (value) {
        'pending' => PaymentItemStatus.pending,
        'approved' => PaymentItemStatus.approved,
        'rejected' => PaymentItemStatus.rejected,
        'recorded' => PaymentItemStatus.recorded,
        _ => PaymentItemStatus.unknown,
      };
}

/// One payable due: an installment or a cost-share remainder.
class PaymentDue extends Equatable {
  const PaymentDue({
    required this.kind,
    required this.refId,
    required this.title,
    required this.amount,
    required this.dueDate,
    required this.pending,
  });

  final PaymentKind kind;
  final String refId;
  final String title;
  final num amount;
  final String? dueDate;

  /// Already held by a payment awaiting verification; cannot be paid again.
  final bool pending;

  /// Stable selection key, e.g. `installment:41`.
  String get key => '${kind.apiValue}:$refId';

  @override
  List<Object?> get props => [kind, refId, title, amount, dueDate, pending];
}

/// Payable "other fee" type (OtherFeeTypeOut). `calculation` is fixed,
/// variable (member types the amount) or picnic (head + additional heads).
class OtherFeeType extends Equatable {
  const OtherFeeType({
    required this.key,
    required this.label,
    required this.calculation,
    this.amount,
    this.unit,
    this.payOnce = false,
    this.alreadyPaid,
    this.headFee,
    this.additionalHeadFee,
  });

  final String key;
  final String label;
  final String calculation;
  final num? amount;
  final String? unit;
  final bool payOnce;
  final bool? alreadyPaid;
  final num? headFee;
  final num? additionalHeadFee;

  bool get isFixed => calculation == 'fixed';
  bool get isVariable => calculation == 'variable';
  bool get isPicnic => calculation == 'picnic';

  @override
  List<Object?> get props => [
        key, label, calculation, amount, unit, payOnce, alreadyPaid, headFee, additionalHeadFee,
      ];
}

class PaymentSummary extends Equatable {
  const PaymentSummary({
    required this.currency,
    required this.totalDue,
    required this.totalPaid,
    required this.pendingCount,
    required this.pendingAmount,
    required this.dues,
    required this.payableFeeTypes,
    required this.accounts,
  });

  final String currency;
  final num totalDue;
  final num totalPaid;
  final int pendingCount;
  final num pendingAmount;
  final List<PaymentDue> dues;
  final List<OtherFeeType> payableFeeTypes;
  final List<PaymentAccount> accounts;

  bool get hasAnythingToPay => dues.any((d) => !d.pending) || payableFeeTypes.isNotEmpty;

  @override
  List<Object?> get props => [
        currency, totalDue, totalPaid, pendingCount, pendingAmount, dues, payableFeeTypes, accounts,
      ];
}

class PaymentHistoryItem extends Equatable {
  const PaymentHistoryItem({
    required this.kind,
    required this.id,
    required this.title,
    required this.amount,
    required this.method,
    required this.reference,
    required this.date,
    required this.status,
    required this.rejectionReason,
    required this.proofUrl,
  });

  final PaymentKind kind;
  final String id;
  final String title;
  final num amount;
  final String? method;
  final String? reference;
  final String date;
  final PaymentItemStatus status;
  final String? rejectionReason;
  final String? proofUrl;

  @override
  List<Object?> get props => [kind, id, title, amount, method, reference, date, status, rejectionReason, proofUrl];
}

class PaymentHistoryPage extends Equatable {
  const PaymentHistoryPage({
    required this.items,
    required this.total,
    required this.page,
    required this.pageSize,
  });

  final List<PaymentHistoryItem> items;
  final int total;
  final int page;
  final int pageSize;

  bool get hasMore => page * pageSize < total;

  @override
  List<Object?> get props => [items, total, page, pageSize];
}

/// POST /member/payments/cost-shares (multipart).
class CostSharePaymentSubmission {
  const CostSharePaymentSubmission({
    required this.shareId,
    required this.amount,
    required this.method,
    required this.transactionRef,
    required this.paidOn,
    this.senderAccount,
    this.note,
    this.proof,
  });

  final String shareId;
  final num amount;
  final String method;
  final String transactionRef;
  final String paidOn;
  final String? senderAccount;
  final String? note;
  final ProofFile? proof;
}

/// POST /member/other-fees/payments (existing JSON endpoint).
class OtherFeePaymentSubmission {
  const OtherFeePaymentSubmission({
    required this.feeType,
    required this.paymentDate,
    required this.paymentMethod,
    required this.receiptNo,
    this.note,
    this.amount,
    this.additionalHeads,
  });

  final String feeType;
  final String paymentDate;
  final String paymentMethod;
  final String receiptNo;
  final String? note;

  /// Only for variable (custom-amount) types.
  final num? amount;

  /// Only for the picnic calculation.
  final int? additionalHeads;
}
