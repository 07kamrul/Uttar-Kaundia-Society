import 'finance_entities.dart';

/// One payment the bulk approve accepted.
class BulkApprovedItem {
  const BulkApprovedItem({required this.kind, required this.id, this.amount, this.idRef});

  factory BulkApprovedItem.fromJson(Map<dynamic, dynamic> j) => BulkApprovedItem(
        kind: '${j['kind']}',
        id: (j['id'] as num).toInt(),
        amount: j['amount']?.toString(),
        idRef: j['id_ref']?.toString(),
      );

  final String kind;
  final int id;
  final String? amount;

  /// Other-fee items only: `fee:<id>` or `picnic:<id>` (the ids overlap).
  final String? idRef;
}

/// One payment the bulk approve could not approve, with the server's code
/// (NO_LONGER_DUE, ALREADY_REVIEWED, AMOUNT_EXCEEDS_REMAINING, NOT_FOUND).
class BulkFailedItem {
  const BulkFailedItem({required this.kind, required this.id, required this.code, this.idRef});

  factory BulkFailedItem.fromJson(Map<dynamic, dynamic> j) => BulkFailedItem(
        kind: '${j['kind']}',
        id: (j['id'] as num).toInt(),
        code: '${j['code']}',
        idRef: j['id_ref']?.toString(),
      );

  final String kind;
  final int id;
  final String code;
  final String? idRef;
}

/// POST /admin/payment-verifications/bulk-approve: per-item results.
class BulkApproveResult {
  const BulkApproveResult({
    required this.batchId,
    required this.approvedCount,
    required this.approvedTotal,
    this.approved = const [],
    this.failed = const [],
  });

  factory BulkApproveResult.fromJson(Map<dynamic, dynamic> j) =>
      BulkApproveResult(
        batchId: '${j['batch_id'] ?? ''}',
        approvedCount: (j['approved_count'] as num?)?.toInt() ?? 0,
        approvedTotal: '${j['approved_total'] ?? '0.00'}',
        approved: [
          for (final r in (j['approved'] as List? ?? const []))
            BulkApprovedItem.fromJson(r as Map),
        ],
        failed: [
          for (final r in (j['failed'] as List? ?? const []))
            BulkFailedItem.fromJson(r as Map),
        ],
      );

  final String batchId;
  final int approvedCount;
  final String approvedTotal;
  final List<BulkApprovedItem> approved;
  final List<BulkFailedItem> failed;

  List<int> get approvedIds => [for (final a in approved) a.id];
}

/// Exact total of [payments] as "1500.00": summed in cents so 0.1 + 0.2 is
/// 0.30. It is the stale guard the server compares with its own total.
String bulkTotalString(Iterable<AdminInstallmentPayment> payments) {
  var cents = 0;
  for (final p in payments) {
    cents += (p.amount * 100).round();
  }
  final whole = cents ~/ 100;
  final frac = (cents % 100).toString().padLeft(2, '0');
  return '$whole.$frac';
}
