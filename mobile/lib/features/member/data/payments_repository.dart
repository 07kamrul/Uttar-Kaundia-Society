import 'package:dio/dio.dart';

import '../../../core/config/app_config.dart';
import '../../../core/enums/enums.dart';
import '../../../core/format/bn_format.dart';
import '../../../core/network/api_client.dart';
import '../domain/merged_payment_entities.dart';
import '../domain/payment_entities.dart';
import 'payment_repository.dart';

num _num(dynamic v) => v is num ? v : (v is String ? num.tryParse(v) ?? 0 : 0);
num? _numOrNull(dynamic v) => v == null ? null : _num(v);
String _str(dynamic v) => v?.toString() ?? '';
String? _strOrNull(dynamic v) => v?.toString();

final RegExp _installmentTitle = RegExp(r'(\d{1,2})\s*/\s*(\d{4})');

/// The server sends "কিস্তি MM/YYYY"; show "মার্চ ২০২৬" when it parses, else the
/// server title unchanged.
String localizedDueTitle(PaymentKind kind, String title) {
  if (kind != PaymentKind.installment) return title;
  final m = _installmentTitle.firstMatch(title);
  final month = m == null ? null : int.tryParse(m.group(1)!);
  if (m == null || month == null || month < 1 || month > 12) return title;
  return '${bnMonthName(month)} ${bnNumber(m.group(2)!)}';
}

PaymentDue _dueFromApi(Map<dynamic, dynamic> api) {
  final kind = PaymentKindX.fromApi(_strOrNull(api['kind'])) ?? PaymentKind.installment;
  return _buildDue(api, kind);
}

PaymentDue _buildDue(Map<dynamic, dynamic> api, PaymentKind kind) => PaymentDue(
      kind: kind,
      refId: _str(api['ref_id']),
      title: localizedDueTitle(kind, _str(api['title'])),
      amount: _num(api['amount']),
      dueDate: _strOrNull(api['due_date']),
      pending: api['pending'] == true,
    );

OtherFeeType _feeTypeFromApi(Map<dynamic, dynamic> api) => OtherFeeType(
      key: _str(api['key']),
      label: _str(api['label']),
      calculation: _str(api['calculation']),
      amount: _numOrNull(api['amount']),
      unit: _strOrNull(api['unit']),
      payOnce: api['pay_once'] == true,
      alreadyPaid: api['already_paid'] as bool?,
      headFee: _numOrNull(api['head_fee']),
      additionalHeadFee: _numOrNull(api['additional_head_fee']),
    );

List<PaymentAccount> _accountsFromApi(Object? raw) => [
      for (final a in (raw as List<dynamic>? ?? const []))
        PaymentAccount(
          method: _str((a as Map<dynamic, dynamic>)['method']),
          details: _str(a['details']),
        ),
    ];

PaymentHistoryItem historyItemFromApi(Map<dynamic, dynamic> api) {
  final proof = _strOrNull(api['proof_url']);
  return PaymentHistoryItem(
    kind: PaymentKindX.fromApi(_strOrNull(api['kind'])) ?? PaymentKind.installment,
    id: _str(api['id']),
    title: _str(api['title']),
    amount: _num(api['amount']),
    method: _strOrNull(api['method']),
    reference: _strOrNull(api['reference']),
    date: _str(api['date']),
    status: PaymentItemStatusX.fromApi(_strOrNull(api['status'])),
    rejectionReason: _strOrNull(api['rejection_reason']),
    proofUrl: proof == null || proof.isEmpty ? null : AppConfig.fileUrl(proof),
  );
}

/// Multipart body with the single `proof` file.
FormData proofForm(ProofFile proof) => FormData()
  ..files.add(MapEntry(
    'proof',
    MultipartFile.fromBytes(proof.bytes, filename: proof.fileName, contentType: DioMediaType.parse(proof.mimeType)),
  ));

/// Batch 2 member payments: merged summary + history, cost-share and
/// other-fee submissions. Installments keep using [MemberPaymentRepository].
class PaymentsRepository {
  PaymentsRepository({required ApiClient apiClient})
      : _api = apiClient,
        _installments = MemberPaymentRepository(apiClient: apiClient);

  final ApiClient _api;
  final MemberPaymentRepository _installments;

  static const _base = '/member/payments';

  /// GET /member/payments/summary.
  Future<PaymentSummary> summary() async {
    final api = await _api.getUri('$_base/summary') as Map<dynamic, dynamic>;
    return PaymentSummary(
      currency: _strOrNull(api['currency']) ?? 'BDT',
      totalDue: _num(api['total_due']),
      totalPaid: _num(api['total_paid']),
      pendingCount: (api['pending_count'] as num?)?.toInt() ?? 0,
      pendingAmount: _num(api['pending_amount']),
      dues: [
        for (final d in (api['dues'] as List<dynamic>? ?? const [])) _dueFromApi(d as Map<dynamic, dynamic>),
      ],
      payableFeeTypes: [
        for (final f in (api['payable_fee_types'] as List<dynamic>? ?? const []))
          _feeTypeFromApi(f as Map<dynamic, dynamic>),
      ],
      accounts: _accountsFromApi(api['accounts']),
    );
  }

  /// Same shape as [summary] built from the pre-Batch 2 installments endpoint,
  /// for Home while `pay_merged_page` is off.
  Future<PaymentSummary> legacySummary() async {
    final payable = await _installments.getPayable();
    final dues = [
      for (final i in payable.due)
        PaymentDue(
          kind: PaymentKind.installment,
          refId: i.id,
          title: '${bnMonthName(i.month)} ${bnNumber(i.year)}',
          amount: i.amount,
          dueDate: null,
          pending: payable.pendingInstallmentIds.contains(i.id),
        ),
    ];
    final pending = payable.payments.where((p) => p.status == SubmissionStatus.pending).toList();
    return PaymentSummary(
      currency: 'BDT',
      totalDue: payable.totalDue,
      totalPaid: 0,
      pendingCount: pending.length,
      pendingAmount: pending.fold<num>(0, (sum, p) => sum + p.amount),
      dues: dues,
      payableFeeTypes: const [],
      accounts: payable.accounts,
    );
  }

  /// GET /member/payments/history (merged, newest first, paginated).
  Future<PaymentHistoryPage> history({
    PaymentKind? kind,
    PaymentItemStatus? status,
    int page = 1,
    int pageSize = 20,
  }) async {
    final raw = await _api.getUri('$_base/history', query: {
      if (kind != null) 'kind': kind.apiValue,
      if (status != null && status != PaymentItemStatus.unknown) 'status': status.apiValue,
      'page': page,
      'page_size': pageSize,
    });
    final api = raw as Map<dynamic, dynamic>;
    final items = [
      for (final r in (api['items'] as List<dynamic>? ?? const [])) historyItemFromApi(r as Map<dynamic, dynamic>),
    ];
    return PaymentHistoryPage(
      items: items,
      total: (api['total'] as num?)?.toInt() ?? items.length,
      page: (api['page'] as num?)?.toInt() ?? page,
      pageSize: (api['page_size'] as num?)?.toInt() ?? pageSize,
    );
  }

  /// POST /member/payments/cost-shares (multipart).
  Future<PaymentHistoryItem> submitCostShare(CostSharePaymentSubmission p) async {
    final form = FormData();
    form.fields
      ..add(MapEntry('share_id', p.shareId))
      ..add(MapEntry('amount', p.amount.toString()))
      ..add(MapEntry('method', p.method))
      ..add(MapEntry('transaction_ref', p.transactionRef.trim()))
      ..add(MapEntry('paid_on', p.paidOn));
    final sender = p.senderAccount?.trim();
    if (sender != null && sender.isNotEmpty) form.fields.add(MapEntry('sender_account', sender));
    final note = p.note?.trim();
    if (note != null && note.isNotEmpty) form.fields.add(MapEntry('note', note));
    final proof = p.proof;
    if (proof != null) {
      form.files.add(MapEntry(
        'proof',
        MultipartFile.fromBytes(proof.bytes,
            filename: proof.fileName, contentType: DioMediaType.parse(proof.mimeType)),
      ));
    }
    final data = await _api.postMultipart('$_base/cost-shares', form) as Map<dynamic, dynamic>;
    return historyItemFromApi(data);
  }

  /// POST /member/other-fees/payments (existing endpoint, JSON body).
  /// Returns the new payment id (null when the server sent none).
  Future<int?> submitOtherFee(OtherFeePaymentSubmission p) async {
    final note = p.note?.trim();
    final data = await _api.post('/member/other-fees/payments', <String, dynamic>{
      'fee_type': p.feeType,
      'payment_date': p.paymentDate,
      'payment_method': p.paymentMethod,
      'receipt_no': p.receiptNo.trim(),
      'note': note == null || note.isEmpty ? null : note,
      'amount': p.amount,
      'additional_heads': p.additionalHeads,
    });
    return data is Map ? (data['id'] as num?)?.toInt() : null;
  }

  /// POST /member/other-fees/payments/{id}/proof (pay_verify_other_fees):
  /// the screenshot of the member's own pending payment.
  Future<void> uploadOtherFeeProof(int paymentId, ProofFile proof) async {
    await _api.postMultipart('/member/other-fees/payments/$paymentId/proof', proofForm(proof));
  }

  /// POST /member/installment-payments (existing multipart endpoint).
  Future<void> submitInstallments(PaymentSubmission payload) async {
    await _installments.submit(payload);
  }
}
