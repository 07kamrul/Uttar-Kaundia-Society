import '../network/api_client.dart';

abstract class FeatureFlagsRepository {
  /// Raw `flags` map from the server. Throws `ApiException` on failure.
  Future<Map<String, bool>> fetch();
}

class FeatureFlagsRepositoryImpl implements FeatureFlagsRepository {
  FeatureFlagsRepositoryImpl({required ApiClient apiClient}) : _api = apiClient;

  final ApiClient _api;

  @override
  Future<Map<String, bool>> fetch() async {
    final raw = await _api.getUri('/public/feature-flags');
    if (raw is! Map) return const {};
    final flags = raw['flags'];
    if (flags is! Map) return const {};
    return {
      for (final entry in flags.entries)
        if (entry.key is String && entry.value is bool) entry.key as String: entry.value as bool,
    };
  }
}
