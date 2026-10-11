import 'dart:convert';

import '../network/api_client.dart';
import '../storage/token_storage.dart';
import 'session.dart';
import '../network/media_token.dart';

/// DTO as returned by POST /login (snake_case on the wire).
class TokenResponseDto {
  const TokenResponseDto({
    required this.accessToken,
    this.refreshToken,
    this.role = 'member',
    this.permissions = const [],
    this.mustChangePassword = false,
  });

  factory TokenResponseDto.fromJson(Map<String, dynamic> json) => TokenResponseDto(
        accessToken: json['access_token'] as String,
        refreshToken: json['refresh_token'] as String?,
        role: (json['role'] as String?) ?? 'member',
        permissions:
            (json['permissions'] as List<dynamic>?)?.map((e) => e.toString()).toList() ??
                const [],
        mustChangePassword: json['must_change_password'] == true || json['must_change_password'] == 1,
      );

  final String accessToken;
  final String? refreshToken;
  final String role;
  final List<String> permissions;
  final bool mustChangePassword;
}

/// Domain entity — camelCase.
class AuthResult {
  const AuthResult({
    required this.session,
    this.mustChangePassword = false,
  });

  final Session session;
  final bool mustChangePassword;
}

extension TokenResponseDtoX on TokenResponseDto {
  AuthResult toEntity() => AuthResult(
        session: Session(
          accessToken: accessToken,
          role: role,
          permissions: permissions.toSet(),
          mustChangePassword: mustChangePassword,
        ),
        mustChangePassword: mustChangePassword,
      );
}

/// Data source + repository in one: login / forgot / reset + persistence.
class AuthRepository {
  AuthRepository({required ApiClient apiClient, required TokenStorage tokenStorage})
      : _api = apiClient,
        _tokens = tokenStorage;

  final ApiClient _api;
  final TokenStorage _tokens;

  Future<AuthResult> login(String identifier, String password) async {
    final data = await _api.post('/login', {
      'identifier': identifier,
      'password': password,
    }) as Map<String, dynamic>;
    final dto = TokenResponseDto.fromJson(data);
    await _tokens.write(access: dto.accessToken, refresh: dto.refreshToken);
    await _tokens.writeSessionMeta(jsonEncode({
      'permissions': dto.permissions,
      'must_change_password': dto.mustChangePassword,
    }));
    // File URLs are built from the media token; have it before pages load.
    await MediaTokenStore.start(_api);
    return dto.toEntity();
  }

  Future<void> forgotPassword(String identifier) =>
      _api.post('/forgot-password', {'identifier': identifier});

  Future<void> resetPassword(String token, String newPassword) => _api.post('/reset-password', {
        'token': token,
        'new_password': newPassword,
      });

  /// Cold-start restore: rebuilds the session from the stored access token by
  /// hitting an authenticated endpoint. Any failure (expired token -> 401,
  /// network, malformed data) wipes storage and returns null -> login screen.
  /// There is no refresh flow by design.
  Future<Session?> restoreSession() async {
    try {
      final token = await _tokens.readAccess();
      if (token == null || token.isEmpty) return null;
      final role = jwtRole(token);
      if (role == null) throw const FormatException('token has no role claim');
      final meta = await _readMeta();
      // Forced password change must go through a fresh login.
      if (meta.mustChangePassword) throw StateError('must change password');
      final Set<String> permissions;
      if (role == 'member') {
        await _api.getUri('/member/me');
        permissions = meta.permissions;
      } else {
        final data = await _api.getUri('/admin/rbac/me/permissions') as List<dynamic>;
        permissions = data.map((e) => e.toString()).toSet();
      }
      await MediaTokenStore.start(_api);
      return Session(accessToken: token, role: role, permissions: permissions);
    } catch (_) {
      MediaTokenStore.clear();
      try {
        await _tokens.clear();
      } catch (_) {
        // Storage wipe failure must not block app start.
      }
      return null;
    }
  }

  Future<({Set<String> permissions, bool mustChangePassword})> _readMeta() async {
    final raw = await _tokens.readSessionMeta();
    if (raw == null) throw StateError('no session metadata (pre-upgrade login)');
    final json = jsonDecode(raw) as Map<String, dynamic>;
    return (
      permissions: (json['permissions'] as List<dynamic>? ?? const [])
          .map((e) => e.toString())
          .toSet(),
      mustChangePassword: json['must_change_password'] == true,
    );
  }

  Future<String?> currentToken() => _tokens.readAccess();

  Future<void> logout() {
    MediaTokenStore.clear();
    return _tokens.clear();
  }
}

/// Reads the `role` claim from a JWT payload WITHOUT verifying the signature —
/// used only for client routing; the server enforces authorization.
String? jwtRole(String token) {
  try {
    final parts = token.split('.');
    if (parts.length != 3) return null;
    final payload = utf8.decode(base64Url.decode(base64Url.normalize(parts[1])));
    final role = (jsonDecode(payload) as Map<String, dynamic>)['role'];
    return role is String && role.isNotEmpty ? role : null;
  } catch (_) {
    return null;
  }
}
