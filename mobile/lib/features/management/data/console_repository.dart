import '../../../core/network/api_client.dart';
import '../domain/console_entities.dart';

/// GET/PUT /admin/phone-fixes (member.manage).
class PhoneFixRepository {
  PhoneFixRepository({required ApiClient apiClient}) : _api = apiClient;

  final ApiClient _api;
  static const _base = '/admin/phone-fixes';

  Future<List<PhoneFix>> list() async {
    final data = await _api.getUri(_base);
    return [for (final r in (data as List).whereType<Map>()) PhoneFix.fromJson(r)];
  }

  Future<void> resolve(int id, String mobile) async {
    await _api.put('$_base/$id', {'mobile': mobile});
  }
}

/// Read-only GET /admin/cache/stats (manage_system_config). There is
/// deliberately no flush call here.
class CacheStatsRepository {
  CacheStatsRepository({required ApiClient apiClient}) : _api = apiClient;

  final ApiClient _api;

  Future<CacheStats> stats() async {
    final data = await _api.getUri('/admin/cache/stats');
    return CacheStats.fromJson(data as Map);
  }
}

/// Membership applications queue (membership_application.manage).
class MembershipApplicationRepository {
  MembershipApplicationRepository({required ApiClient apiClient}) : _api = apiClient;

  final ApiClient _api;
  static const _base = '/admin/membership-applications';

  Future<List<MembershipApplication>> list({String? status, String? search}) async {
    final data = await _api.getUri(_base, query: {
      if (status != null) 'status_filter': status,
      if (search != null && search.isNotEmpty) 'search': search,
    });
    return [for (final r in (data as List).whereType<Map>()) MembershipApplication.fromJson(r)];
  }

  Future<void> startReview(int id) async {
    await _api.post('$_base/$id/start-review', <String, dynamic>{});
  }

  Future<void> approve(int id) async {
    await _api.post('$_base/$id/approve', {'member_class': 'general'});
  }

  Future<void> reject(int id, String reason) async {
    await _api.post('$_base/$id/reject', {'reason': reason});
  }
}
