import '../../../core/config/app_config.dart';

num _num(Object? v) => v is num ? v : num.tryParse('${v ?? ''}') ?? 0;

String? _str(Object? v) => v?.toString();

/// One row of GET /admin/cost-share-payments (Angular AdminCostSharePayment).
class AdminCostSharePayment {
  const AdminCostSharePayment({
    required this.id,
    required this.memberId,
    required this.shareId,
    required this.amountDue,
    required this.amountPaid,
    required this.remaining,
    required this.method,
    required this.transactionRef,
    required this.amount,
    required this.paidOn,
    required this.status,
    required this.createdAt,
    this.memberName,
    this.memberDisplayId,
    this.costTitle,
    this.senderAccount,
    this.proofUrl,
    this.note,
    this.rejectionReason,
    this.reviewedAt,
  });

  factory AdminCostSharePayment.fromJson(Map<dynamic, dynamic> j) {
    final proof = _str(j['proof_url']);
    return AdminCostSharePayment(
      id: (j['id'] as num).toInt(),
      memberId: _num(j['member_id']).toInt(),
      memberName: _str(j['member_name']),
      memberDisplayId: _str(j['member_display_id']),
      shareId: _num(j['share_id']).toInt(),
      costTitle: _str(j['cost_title']),
      amountDue: _num(j['amount_due']),
      amountPaid: _num(j['amount_paid']),
      remaining: _num(j['remaining']),
      method: _str(j['method']) ?? '',
      transactionRef: _str(j['transaction_ref']) ?? '',
      senderAccount: _str(j['sender_account']),
      amount: _num(j['amount']),
      paidOn: _str(j['paid_on']) ?? '',
      proofUrl: proof == null || proof.isEmpty ? null : AppConfig.fileUrl(proof),
      note: _str(j['note']),
      status: _str(j['status']) ?? 'pending',
      rejectionReason: _str(j['rejection_reason']),
      reviewedAt: _str(j['reviewed_at']),
      createdAt: _str(j['created_at']) ?? '',
    );
  }

  final int id;
  final int memberId;
  final String? memberName;
  final String? memberDisplayId;
  final int shareId;
  final String? costTitle;
  final num amountDue;
  final num amountPaid;

  /// amount_due - amount_paid; does not subtract payments still pending.
  final num remaining;
  final String method;
  final String transactionRef;
  final String? senderAccount;
  final num amount;
  final String paidOn;
  final String? proofUrl;
  final String? note;

  /// 'pending' | 'approved' | 'rejected'
  final String status;
  final String? rejectionReason;
  final String? reviewedAt;
  final String createdAt;

  bool get isPending => status == 'pending';
}

/// GET /admin/payment-verifications/pending-count.
class PendingVerificationCounts {
  const PendingVerificationCounts({
    required this.installment,
    required this.costShare,
    required this.otherFee,
    required this.total,
  });

  factory PendingVerificationCounts.fromJson(Map<dynamic, dynamic> j) =>
      PendingVerificationCounts(
        installment: _num(j['installment']).toInt(),
        costShare: _num(j['cost_share']).toInt(),
        otherFee: _num(j['other_fee']).toInt(),
        total: _num(j['total']).toInt(),
      );

  final int installment;
  final int costShare;
  final int otherFee;
  final int total;
}
