import '../../../core/config/app_config.dart';

/// `fee` = fee_payments, `picnic` = picnic_payments (their ids overlap).
enum OtherFeeKind { fee, picnic }

extension OtherFeeKindX on OtherFeeKind {
  String get apiValue => name;

  static OtherFeeKind fromApi(Object? v) => v == 'picnic' ? OtherFeeKind.picnic : OtherFeeKind.fee;
}

/// One row of GET /admin/other-fee-payments (pay_verify_other_fees).
class AdminOtherFeePayment {
  const AdminOtherFeePayment({
    required this.id,
    required this.kind,
    required this.memberName,
    required this.memberDisplayId,
    required this.feeLabel,
    required this.amount,
    required this.method,
    required this.receiptNo,
    required this.paymentDate,
    required this.proofUrl,
    required this.status,
    required this.rejectionReason,
  });

  factory AdminOtherFeePayment.fromJson(Map<dynamic, dynamic> j) {
    final amount = j['amount'];
    final proof = j['proof_url']?.toString();
    return AdminOtherFeePayment(
      id: (j['id'] as num).toInt(),
      kind: OtherFeeKindX.fromApi(j['kind']),
      memberName: j['member_name']?.toString(),
      memberDisplayId: j['member_display_id']?.toString(),
      feeLabel: j['fee_label']?.toString() ?? '',
      amount: amount is num ? amount : num.tryParse('$amount') ?? 0,
      method: j['payment_method']?.toString(),
      receiptNo: j['receipt_no']?.toString(),
      paymentDate: j['payment_date']?.toString() ?? '',
      proofUrl: proof == null || proof.isEmpty ? null : AppConfig.fileUrl(proof),
      status: j['status']?.toString() ?? 'pending',
      rejectionReason: j['rejection_reason']?.toString(),
    );
  }

  final int id;
  final OtherFeeKind kind;
  final String? memberName;
  final String? memberDisplayId;
  final String feeLabel;
  final num amount;
  final String? method;
  final String? receiptNo;
  final String paymentDate;
  final String? proofUrl;
  final String status;
  final String? rejectionReason;

  /// Unique per row: `picnic:4`.
  String get key => '${kind.apiValue}:$id';

  bool get isPending => status == 'pending';
}

/// Exact total of [rows] as "1500.00" (summed in cents).
String otherFeeTotalString(Iterable<AdminOtherFeePayment> rows) {
  var cents = 0;
  for (final r in rows) {
    cents += (r.amount * 100).round();
  }
  return '${cents ~/ 100}.${(cents % 100).toString().padLeft(2, '0')}';
}
