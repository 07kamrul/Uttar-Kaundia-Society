import 'package:equatable/equatable.dart';

import 'merged_payment_entities.dart';

/// Upper bound on picnic additional heads (Angular MAX_ADDITIONAL_HEADS).
const maxOtherFeeHeads = 20;

/// Relation of one additional picnic head (Angular RELATIONS).
enum FeeHeadRelation { spouse, child, guest }

/// Name + relation of one additional picnic head.
class FeeHeadLabel extends Equatable {
  const FeeHeadLabel({required this.name, this.relation = FeeHeadRelation.guest});

  final String name;
  final FeeHeadRelation relation;

  FeeHeadLabel copyWith({String? name, FeeHeadRelation? relation}) =>
      FeeHeadLabel(name: name ?? this.name, relation: relation ?? this.relation);

  @override
  List<Object?> get props => [name, relation];
}

/// One row of GET /member/other-fees/payments.
class OtherFeePayment extends Equatable {
  const OtherFeePayment({
    required this.id,
    required this.source,
    required this.feeType,
    required this.amount,
    required this.paymentDate,
    required this.additionalHeads,
    required this.receiptNo,
    required this.paymentMethod,
    required this.note,
    required this.createdAt,
    required this.status,
    required this.rejectionReason,
    required this.proofUrl,
  });

  final int id;
  final String source;
  final String feeType;
  final num amount;
  final String paymentDate;
  final int? additionalHeads;
  final String? receiptNo;
  final String? paymentMethod;
  final String? note;
  final String createdAt;

  /// 'pending' | 'approved' | 'rejected' (always 'approved' while
  /// pay_verify_other_fees is off).
  final String status;
  final String? rejectionReason;
  final String? proofUrl;

  @override
  List<Object?> get props => [id, source, feeType, amount, paymentDate, status];
}

class OtherFeeHistorySummary extends Equatable {
  const OtherFeeHistorySummary({required this.totalPaid, required this.byType});

  final num totalPaid;
  final Map<String, num> byType;

  @override
  List<Object?> get props => [totalPaid, byType];
}

class OtherFeeHistoryPage extends Equatable {
  const OtherFeeHistoryPage({
    required this.items,
    required this.total,
    required this.page,
    required this.pageSize,
    required this.summary,
  });

  final List<OtherFeePayment> items;
  final int total;
  final int page;
  final int pageSize;
  final OtherFeeHistorySummary summary;

  @override
  List<Object?> get props => [items, total, page, pageSize, summary];
}

/// History filters; null means "any".
class OtherFeeHistoryFilter extends Equatable {
  const OtherFeeHistoryFilter({this.feeType, this.dateFrom, this.dateTo});

  final String? feeType;
  final String? dateFrom;
  final String? dateTo;

  OtherFeeHistoryFilter copyWith({
    String? Function()? feeType,
    String? Function()? dateFrom,
    String? Function()? dateTo,
  }) =>
      OtherFeeHistoryFilter(
        feeType: feeType == null ? this.feeType : feeType(),
        dateFrom: dateFrom == null ? this.dateFrom : dateFrom(),
        dateTo: dateTo == null ? this.dateTo : dateTo(),
      );

  @override
  List<Object?> get props => [feeType, dateFrom, dateTo];
}

/// POST /member/other-fees/payments body. [amount] is for variable types only;
/// fixed and picnic totals are recomputed server-side.
class OtherFeeCreateInput extends Equatable {
  const OtherFeeCreateInput({
    required this.feeType,
    required this.paymentDate,
    required this.paymentMethod,
    this.receiptNo,
    this.note,
    this.amount,
    this.additionalHeads,
    this.additionalPeople = const [],
  });

  final String feeType;
  final String paymentDate;
  final String paymentMethod;
  final String? receiptNo;
  final String? note;
  final num? amount;
  final int? additionalHeads;
  final List<FeeHeadLabel> additionalPeople;

  @override
  List<Object?> get props =>
      [feeType, paymentDate, paymentMethod, receiptNo, note, amount, additionalHeads, additionalPeople];
}

/// Client-side preview of what the selected type will cost.
class OtherFeeBreakdown extends Equatable {
  const OtherFeeBreakdown({
    required this.isPicnic,
    required this.count,
    required this.headFee,
    required this.additionalHeadFee,
    required this.additionalAmount,
    required this.total,
  });

  final bool isPicnic;
  final int count;
  final num headFee;
  final num additionalHeadFee;
  final num additionalAmount;
  final num total;

  @override
  List<Object?> get props => [isPicnic, count, headFee, additionalHeadFee, additionalAmount, total];
}

/// Mirrors Angular `breakdown`: picnic = head fee + heads x additional fee,
/// fixed = the configured amount, variable/unconfigured = null.
OtherFeeBreakdown? otherFeeBreakdown(OtherFeeType? type, int heads) {
  if (type == null) return null;
  if (type.isPicnic) {
    final head = type.headFee;
    final extra = type.additionalHeadFee;
    if (head == null || extra == null) return null;
    final additional = extra * heads;
    return OtherFeeBreakdown(
      isPicnic: true,
      count: heads,
      headFee: head,
      additionalHeadFee: extra,
      additionalAmount: additional,
      total: head + additional,
    );
  }
  final amount = type.amount;
  if (type.isFixed && amount != null) {
    return OtherFeeBreakdown(
      isPicnic: false,
      count: 0,
      headFee: amount,
      additionalHeadFee: 0,
      additionalAmount: 0,
      total: amount,
    );
  }
  return null;
}
