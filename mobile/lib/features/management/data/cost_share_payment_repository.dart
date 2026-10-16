import '../../../core/network/api_client.dart';
import '../domain/cost_share_verification_entities.dart';

/// Committee side of member cost-share payments plus the combined pending
/// count (Angular CostSharePaymentService).
class CostSharePaymentRepository {
  CostSharePaymentRepository({required ApiClient apiClient}) : _api = apiClient;

  final ApiClient _api;
  static const _base = '/admin/cost-share-payments';

  Future<List<AdminCostSharePayment>> list({String? status}) async {
    final data = await _api.getUri(_base, query: {if (status != null) 'status': status});
    return [for (final r in (data as List).whereType<Map>()) AdminCostSharePayment.fromJson(r)];
  }

  Future<AdminCostSharePayment> approve(int id) async {
    final data = await _api.post('$_base/$id/approve', <String, dynamic>{});
    return AdminCostSharePayment.fromJson(data as Map);
  }

  Future<AdminCostSharePayment> reject(int id, String reason) async {
    final data = await _api.post('$_base/$id/reject', {'reason': reason});
    return AdminCostSharePayment.fromJson(data as Map);
  }

  Future<PendingVerificationCounts> pendingCounts() async {
    final data = await _api.getUri('/admin/payment-verifications/pending-count');
    return PendingVerificationCounts.fromJson(data as Map);
  }
}
