import '../../../core/config/app_config.dart';
import '../../../core/network/api_client.dart';
import '../domain/merged_payment_entities.dart';
import '../domain/other_fees_entities.dart';

num _num(dynamic v) => v is num ? v : (v is String ? num.tryParse(v) ?? 0 : 0);
num? _numOrNull(dynamic v) => v == null ? null : _num(v);
String? _strOrNull(dynamic v) => v?.toString();
String? _blankToNull(String? v) {
  final t = v?.trim();
  return t == null || t.isEmpty ? null : t;
}

/// GET /member/other-fees/types row -> [OtherFeeType] (catalog is API data).
OtherFeeType otherFeeTypeFromApi(Map<dynamic, dynamic> api) => OtherFeeType(
      key: '${api['key'] ?? ''}',
      label: '${api['label'] ?? ''}',
      calculation: '${api['calculation'] ?? ''}',
      amount: _numOrNull(api['amount']),
      unit: _strOrNull(api['unit']),
      payOnce: api['pay_once'] == true,
      alreadyPaid: api['already_paid'] as bool?,
      headFee: _numOrNull(api['head_fee']),
      additionalHeadFee: _numOrNull(api['additional_head_fee']),
    );

OtherFeePayment otherFeePaymentFromApi(Map<dynamic, dynamic> api) {
  final proof = _strOrNull(api['proof_url']);
  return OtherFeePayment(
    id: (api['id'] as num).toInt(),
    source: '${api['source'] ?? ''}',
    feeType: '${api['fee_type'] ?? ''}',
    amount: _num(api['amount']),
    paymentDate: '${api['payment_date'] ?? ''}',
    additionalHeads: (api['additional_heads'] as num?)?.toInt(),
    receiptNo: _strOrNull(api['receipt_no']),
    paymentMethod: _strOrNull(api['payment_method']),
    note: _strOrNull(api['note']),
    createdAt: '${api['created_at'] ?? ''}',
    status: _strOrNull(api['status']) ?? 'approved',
    rejectionReason: _strOrNull(api['rejection_reason']),
    proofUrl: proof == null || proof.isEmpty ? null : AppConfig.fileUrl(proof),
  );
}

/// Port of Angular OtherFeesService: the unified member fee page (picnic and
/// every other non-installment fee type).
class OtherFeesRepository {
  OtherFeesRepository({required ApiClient apiClient}) : _api = apiClient;

  final ApiClient _api;
  static const _base = '/member/other-fees';

  Future<List<OtherFeeType>> getFeeTypes({String? paymentDate}) async {
    final data = await _api.getUri('$_base/types', query: {
      if (paymentDate != null && paymentDate.isNotEmpty) 'payment_date': paymentDate,
    });
    return [for (final r in (data as List).whereType<Map>()) otherFeeTypeFromApi(r)];
  }

  Future<OtherFeeHistoryPage> getPayments(
    OtherFeeHistoryFilter filter, {
    required int page,
    required int pageSize,
  }) async {
    final raw = await _api.getUri('$_base/payments', query: {
      if (filter.feeType != null) 'fee_type': filter.feeType!,
      if (filter.dateFrom != null) 'date_from': filter.dateFrom!,
      if (filter.dateTo != null) 'date_to': filter.dateTo!,
      'page': '$page',
      'page_size': '$pageSize',
    });
    final api = raw as Map<dynamic, dynamic>;
    final summary = api['summary'] as Map<dynamic, dynamic>? ?? const {};
    final byType = summary['by_type'] as Map<dynamic, dynamic>? ?? const {};
    final items = [
      for (final r in (api['items'] as List<dynamic>? ?? const []).whereType<Map>()) otherFeePaymentFromApi(r),
    ];
    return OtherFeeHistoryPage(
      items: List.unmodifiable(items),
      total: (api['total'] as num?)?.toInt() ?? items.length,
      page: (api['page'] as num?)?.toInt() ?? page,
      pageSize: (api['page_size'] as num?)?.toInt() ?? pageSize,
      summary: OtherFeeHistorySummary(
        totalPaid: _num(summary['total_paid']),
        byType: Map.unmodifiable({for (final e in byType.entries) '${e.key}': _num(e.value)}),
      ),
    );
  }

  Future<OtherFeePayment> createPayment(OtherFeeCreateInput input) async {
    final data = await _api.post('$_base/payments', <String, dynamic>{
      'fee_type': input.feeType,
      'payment_date': input.paymentDate,
      'payment_method': _blankToNull(input.paymentMethod),
      'receipt_no': _blankToNull(input.receiptNo),
      'note': _blankToNull(input.note),
      'amount': input.amount,
      'additional_heads': input.additionalHeads,
      'additional_people': input.additionalPeople.isEmpty
          ? null
          : [
              for (final p in input.additionalPeople) {'name': p.name.trim(), 'relation': p.relation.name},
            ],
    });
    return otherFeePaymentFromApi(data as Map<dynamic, dynamic>);
  }
}
