import '../../../core/network/api_client.dart';
import '../domain/bulk_entities.dart';
import '../domain/other_fee_verification_entities.dart';

/// Committee side of member other-fee and picnic payments
/// (flag pay_verify_other_fees; the server answers 404 FEATURE_DISABLED off).
class OtherFeeVerificationRepository {
  OtherFeeVerificationRepository({required ApiClient apiClient}) : _api = apiClient;

  final ApiClient _api;
  static const _base = '/admin/other-fee-payments';

  Future<List<AdminOtherFeePayment>> list({String? status}) async {
    final data = await _api.getUri(_base, query: {if (status != null) 'status': status});
    return [for (final r in (data as List).whereType<Map>()) AdminOtherFeePayment.fromJson(r)];
  }

  Future<void> approve(OtherFeeKind kind, int id) async {
    await _api.post('$_base/${kind.apiValue}/$id/approve', <String, dynamic>{});
  }

  Future<void> reject(OtherFeeKind kind, int id, String reason) async {
    await _api.post('$_base/${kind.apiValue}/$id/reject', {'reason': reason});
  }

  /// Items are `kind: other_fee` with `id_ref: "fee:<id>" | "picnic:<id>"`.
  Future<BulkApproveResult> bulkApprove(
    List<AdminOtherFeePayment> rows, {
    required int expectedCount,
    required String expectedTotal,
  }) async {
    final data = await _api.post('/admin/payment-verifications/bulk-approve', {
      'items': [
        for (final r in rows) {'kind': 'other_fee', 'id': r.id, 'id_ref': r.key},
      ],
      'expected_count': expectedCount,
      'expected_total': expectedTotal,
    });
    return BulkApproveResult.fromJson(data as Map);
  }
}
