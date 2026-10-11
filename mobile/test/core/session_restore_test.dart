import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/core/auth/auth_repository.dart';
import 'package:kaundia_app/core/config/app_config.dart';
import 'package:kaundia_app/core/network/api_client.dart';
import 'package:kaundia_app/core/network/api_exception.dart';
import 'package:kaundia_app/core/storage/token_storage.dart';
import 'package:mocktail/mocktail.dart';

class MockApiClient extends Mock implements ApiClient {}

class MockTokenStorage extends Mock implements TokenStorage {}

String _jwt(Map<String, dynamic> payload) {
  String enc(Object o) => base64Url.encode(utf8.encode(jsonEncode(o))).replaceAll('=', '');
  return '${enc({'alg': 'HS256'})}.${enc(payload)}.sig';
}

void main() {
  late MockApiClient api;
  late MockTokenStorage tokens;
  late AuthRepository repo;

  setUp(() {
    api = MockApiClient();
    tokens = MockTokenStorage();
    repo = AuthRepository(apiClient: api, tokenStorage: tokens);
    when(() => tokens.clear()).thenAnswer((_) async {});
    when(() => api.getUri('/media-token')).thenAnswer((_) async => {'media_token': 'm'});
  });

  test('jwtRole decodes role claim and rejects garbage', () {
    expect(jwtRole(_jwt({'role': 'treasurer'})), 'treasurer');
    expect(jwtRole('not-a-jwt'), isNull);
  });

  test('returns null without stored token', () async {
    when(() => tokens.readAccess()).thenAnswer((_) async => null);
    expect(await repo.restoreSession(), isNull);
  });

  test('restores admin session with fresh permissions', () async {
    final token = _jwt({'role': 'treasurer'});
    when(() => tokens.readAccess()).thenAnswer((_) async => token);
    when(() => tokens.readSessionMeta())
        .thenAnswer((_) async => jsonEncode({'permissions': [], 'must_change_password': false}));
    when(() => api.getUri('/admin/rbac/me/permissions'))
        .thenAnswer((_) async => ['manage_finance']);
    final s = await repo.restoreSession();
    expect(s!.role, 'treasurer');
    expect(s.permissions, {'manage_finance'});
    verify(() => api.getUri('/media-token')).called(1);
  });

  test('restores member session with stored permissions', () async {
    when(() => tokens.readAccess()).thenAnswer((_) async => _jwt({'role': 'member'}));
    when(() => tokens.readSessionMeta()).thenAnswer(
        (_) async => jsonEncode({'permissions': ['profile.view_own'], 'must_change_password': false}));
    when(() => api.getUri('/member/me')).thenAnswer((_) async => <String, dynamic>{});
    final s = await repo.restoreSession();
    expect(s!.permissions, {'profile.view_own'});
  });

  test('401 clears storage and returns null', () async {
    when(() => tokens.readAccess()).thenAnswer((_) async => _jwt({'role': 'member'}));
    when(() => tokens.readSessionMeta())
        .thenAnswer((_) async => jsonEncode({'permissions': [], 'must_change_password': false}));
    when(() => api.getUri('/member/me'))
        .thenThrow(const ApiException(type: ApiExceptionType.unauthorized));
    expect(await repo.restoreSession(), isNull);
    verify(() => tokens.clear()).called(1);
  });

  test('assertReleaseSafe rejects http/localhost, accepts https', () {
    expect(() => AppConfig.assertReleaseSafe(url: 'http://localhost:8000/api'), throwsStateError);
    expect(() => AppConfig.assertReleaseSafe(url: 'https://localhost/api'), throwsStateError);
    expect(() => AppConfig.assertReleaseSafe(url: 'http://api.example.com/api'), throwsStateError);
    AppConfig.assertReleaseSafe(url: 'https://api.example.com/api');
  });
}
