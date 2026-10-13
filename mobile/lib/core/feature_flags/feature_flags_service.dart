import 'package:flutter/foundation.dart';

import 'feature_flag.dart';
import 'feature_flags_repository.dart';

/// Cached in-memory feature flags. Every flag is false until a load succeeds;
/// [load] never throws, so it is safe to fire at startup without awaiting.
/// A failed refresh keeps the last successfully loaded values.
class FeatureFlagsService extends ChangeNotifier {
  FeatureFlagsService(this._repository);

  final FeatureFlagsRepository _repository;
  Map<String, bool> _flags = const {};
  bool _isLoaded = false;
  Future<void>? _inFlight;

  bool get isLoaded => _isLoaded;

  bool isEnabled(FeatureFlag flag) => _flags[flag.key] ?? false;

  /// Fetches flags from the server. Concurrent calls share one request.
  Future<void> load() => _inFlight ??= _fetch().whenComplete(() => _inFlight = null);

  Future<void> _fetch() async {
    try {
      _flags = await _repository.fetch();
      _isLoaded = true;
      notifyListeners();
    } catch (_) {
      // Fail closed: keep whatever we had (initially all false).
    }
  }
}
