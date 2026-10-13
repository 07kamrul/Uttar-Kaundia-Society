import '../network/api_client.dart';

/// The society's helpline (GET /public/helpline). Hidden in the UI until the
/// admin sets a number: [enabled] is true only when a phone or WhatsApp exists.
class Helpline {
  const Helpline({this.phone, this.whatsapp, this.hoursText, this.enabled = false});

  static const Helpline empty = Helpline();

  final String? phone;
  final String? whatsapp;
  final String? hoursText;
  final bool enabled;

  static String? _clean(Object? v) {
    final s = v?.toString().trim();
    return s == null || s.isEmpty ? null : s;
  }

  factory Helpline.fromApi(Map<dynamic, dynamic> api) {
    final phone = _clean(api['phone']);
    final whatsapp = _clean(api['whatsapp']);
    final hasNumber = phone != null || whatsapp != null;
    return Helpline(
      phone: phone,
      whatsapp: whatsapp,
      hoursText: _clean(api['hours_text']),
      enabled: hasNumber && (api['enabled'] as bool? ?? true),
    );
  }
}

class HelplineRepository {
  HelplineRepository({required ApiClient apiClient}) : _api = apiClient;

  final ApiClient _api;
  Helpline? _cached;

  /// Cached after the first successful read. A failure yields [Helpline.empty]
  /// (button stays hidden) and is retried on the next call.
  Future<Helpline> load() async {
    final cached = _cached;
    if (cached != null) return cached;
    try {
      final raw = await _api.getUri('/public/helpline');
      final value = raw is Map ? Helpline.fromApi(raw) : Helpline.empty;
      return _cached = value;
    } catch (_) {
      return Helpline.empty;
    }
  }

  /// Drops the cache (after the admin edits the numbers).
  void invalidate() => _cached = null;
}
