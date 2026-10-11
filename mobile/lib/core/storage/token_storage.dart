import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Token + role storage — flutter_secure_storage (mobile equivalent of the
/// Angular localStorage keys krmf_access_token / krmf_refresh_token).
class TokenStorage {
  TokenStorage({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  static const _accessKey = 'krmf_access_token';
  static const _refreshKey = 'krmf_refresh_token';
  static const _sessionKey = 'krmf_session_meta';

  /// JSON snapshot of login-time session metadata (permissions,
  /// must_change_password) used to rebuild the session on cold start.
  Future<String?> readSessionMeta() => _storage.read(key: _sessionKey);
  Future<void> writeSessionMeta(String json) => _storage.write(key: _sessionKey, value: json);

  Future<String?> readAccess() => _storage.read(key: _accessKey);
  Future<String?> readRefresh() => _storage.read(key: _refreshKey);

  Future<void> write({String? access, String? refresh}) async {
    if (access != null) {
      await _storage.write(key: _accessKey, value: access);
    }
    if (refresh != null) {
      await _storage.write(key: _refreshKey, value: refresh);
    }
  }

  Future<void> clear() async {
    await _storage.delete(key: _accessKey);
    await _storage.delete(key: _refreshKey);
    await _storage.delete(key: _sessionKey);
  }
}
