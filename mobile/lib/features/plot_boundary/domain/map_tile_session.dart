import 'package:flutter/foundation.dart';

/// "মানচিত্র দেখুন" choice, kept for the rest of the app session (Angular
/// keeps it in sessionStorage `krmf_map_tiles_ok`). With data saver on the
/// page ignores it and asks again on every visit.
class MapTileSession {
  const MapTileSession._();

  static bool _ok = false;

  static bool get ok => _ok;

  static void remember() => _ok = true;

  /// Test hook: forget the session-wide choice.
  @visibleForTesting
  static void reset() => _ok = false;
}
