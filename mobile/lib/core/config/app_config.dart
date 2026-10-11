import '../network/media_token.dart';

/// Build-time configuration, supplied via --dart-define (no secrets in code).
class AppConfig {
  const AppConfig._();

  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:8000/api',
  );

  /// Throws when a release build would talk to an insecure or local API.
  /// Called from main() only when kReleaseMode; [url] is injectable for tests.
  static void assertReleaseSafe({String url = apiBaseUrl}) {
    final uri = Uri.tryParse(url);
    final host = uri?.host.toLowerCase() ?? '';
    const localHosts = {'localhost', '127.0.0.1', '0.0.0.0', '10.0.2.2', '::1'};
    if (uri == null || uri.scheme != 'https' || localHosts.contains(host)) {
      throw StateError(
        'Release build misconfigured: API_BASE_URL must be an https, non-localhost '
        'URL (got "$url"). Pass --dart-define=API_BASE_URL=https://<host>/api.',
      );
    }
  }

  /// Flavor: dev | prod. Drives logging verbosity etc.
  static const String flavor = String.fromEnvironment('APP_FLAVOR', defaultValue: 'dev');

  /// Static uploads are served from the API origin with the /api suffix stripped
  /// (mirrors Angular `toFileUrl()` in admin.service.ts).
  static String get uploadsBaseUrl =>
      apiBaseUrl.endsWith('/api') ? apiBaseUrl.substring(0, apiBaseUrl.length - 4) : apiBaseUrl;

  /// Mirrors Angular toFileUrl(): percent-encodes each path segment separately
  /// (Bengali upload paths), preserving slashes.
  static String fileUrl(String rawPath) {
    final path = rawPath.startsWith('/') ? rawPath : '/$rawPath';
    final encoded = path
        .split('/')
        .map((seg) => seg.isEmpty ? seg : Uri.encodeComponent(seg))
        .join('/');
    // /uploads is private: the backend requires the short-lived media token.
    final token = MediaTokenStore.current;
    final query = token == null ? '' : '?t=${Uri.encodeQueryComponent(token)}';
    return '$uploadsBaseUrl$encoded$query';
  }
  /// Street basemap tiles (default: OpenStreetMap). Supply via --dart-define
  /// in production to respect the tile provider's usage policy.
  static const String mapTileUrl = String.fromEnvironment(
    'MAP_TILE_URL',
    defaultValue: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  );

  /// Satellite basemap tiles (default: Esri World Imagery).
  static const String satelliteTileUrl = String.fromEnvironment(
    'SATELLITE_TILE_URL',
    defaultValue:
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  );

  /// Society extent as `minLng,minLat,maxLng,maxLat` (plot-map initial camera
  /// and client-side inside-society validation). Defaults to the society extent.
  static const String societyBboxRaw = String.fromEnvironment(
    'SOCIETY_BBOX',
    defaultValue: defaultSocietyBbox,
  );

  /// Uttar Kaundia society extent (mirrors Angular `environment.societyBbox`).
  static const String defaultSocietyBbox = '90.3000,23.7800,90.3470,23.8380';

  /// Society centre and default zoom (mirrors Angular SOCIETY_CENTER / z14).
  static const double societyCenterLat = 23.809;
  static const double societyCenterLng = 90.323;
  static const double societyDefaultZoom = 14;

  /// Uttar Kaundia mouza centre (mirrors Angular MOUZA_CENTER).
  static const double mouzaCenterLat = 23.7985;
  static const double mouzaCenterLng = 90.3325;
}
