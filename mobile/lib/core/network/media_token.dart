import 'dart:async';

import 'api_client.dart';

/// Short-lived token the backend requires as `?t=` on every /uploads request
/// (Image.network / downloads cannot rely on the Bearer header). Mirrors
/// Angular `MediaTokenService`.
class MediaTokenStore {
  MediaTokenStore._();

  /// Refresh well before the backend's 30-minute expiry.
  static const Duration refreshInterval = Duration(minutes: 10);

  static String? _current;
  static Timer? _timer;

  /// Read synchronously by [AppConfig.fileUrl]; null when logged out.
  static String? get current => _current;

  /// Fetches a token now and keeps it fresh. Never throws: without a token
  /// files simply fail to load rather than breaking login.
  static Future<void> start(ApiClient api) async {
    _timer?.cancel();
    _timer = Timer.periodic(refreshInterval, (_) => _fetch(api));
    await _fetch(api);
  }

  static void clear() {
    _timer?.cancel();
    _timer = null;
    _current = null;
  }

  static Future<void> _fetch(ApiClient api) async {
    try {
      final data = await api.getUri('/media-token') as Map<String, dynamic>;
      _current = data['media_token'] as String?;
    } catch (_) {
      // Keep the previous token (if any); the next tick retries.
    }
  }
}
