import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/core/network/api_error_messages.dart';
import 'package:kaundia_app/core/network/api_exception.dart';
import 'package:kaundia_app/l10n/app_localizations_bn.dart';
import 'package:kaundia_app/l10n/app_localizations_en.dart';
import 'package:kaundia_app/shared/utils/file_utils.dart';

ApiException _http(int code, {ApiExceptionType type = ApiExceptionType.server, String? detail}) =>
    ApiException(
      type: type,
      statusCode: code,
      message: detail,
      businessMessage: detail,
    );

void main() {
  final bn = AppLocalizationsBn();
  final en = AppLocalizationsEn();

  test('network error -> offline', () {
    expect(apiErrorMessage(bn, const ApiException(type: ApiExceptionType.network)),
        bn.apiErrorOffline);
  });
  test('401 -> session expired', () {
    expect(apiErrorMessage(bn, _http(401, type: ApiExceptionType.unauthorized)),
        bn.apiErrorSessionExpired);
  });
  test('403 -> forbidden', () => expect(apiErrorMessage(bn, _http(403)), bn.apiErrorForbidden));
  test('404 -> not found', () => expect(apiErrorMessage(bn, _http(404)), bn.apiErrorNotFound));
  test('409 -> conflict', () => expect(apiErrorMessage(bn, _http(409)), bn.apiErrorConflict));
  test('413 -> file too large',
      () => expect(apiErrorMessage(bn, _http(413)), bn.apiErrorFileTooLarge));
  test('422 -> invalid input', () {
    expect(apiErrorMessage(bn, _http(422, type: ApiExceptionType.validation)),
        bn.apiErrorInvalidInput);
  });
  test('400 business -> invalid input (no raw detail)', () {
    expect(apiErrorMessage(bn, _http(400, type: ApiExceptionType.business, detail: 'NID exists')),
        bn.apiErrorInvalidInput);
  });
  test('429 -> too many requests', () {
    expect(apiErrorMessage(bn, _http(429)), bn.apiErrorTooManyRequests);
  });
  test('5xx -> server', () {
    for (final c in [500, 502, 503, 504, 599]) {
      expect(apiErrorMessage(bn, _http(c)), bn.apiErrorServer, reason: '$c');
    }
  });
  test('unknown status / unknown type / non-ApiException -> unknown', () {
    expect(apiErrorMessage(bn, _http(418)), bn.apiErrorUnknown);
    expect(apiErrorMessage(bn, const ApiException(type: ApiExceptionType.unknown)),
        bn.apiErrorUnknown);
    expect(apiErrorMessage(bn, StateError('x')), bn.apiErrorUnknown);
    expect(apiErrorMessage(bn, Object()), bn.apiErrorUnknown);
  });
  test('client-side FileTooLargeError -> file too large', () {
    expect(apiErrorMessage(bn, const FileTooLargeError()), bn.apiErrorFileTooLarge);
  });
  test('never leaks raw server detail', () {
    const secret = 'SQL: relation "members" does not exist';
    for (final c in [400, 401, 403, 404, 409, 413, 422, 429, 500, 418]) {
      final e = _http(c, detail: secret);
      expect(apiErrorMessage(bn, e), isNot(contains('SQL')));
      expect(apiErrorMessage(en, e), isNot(contains('SQL')));
    }
  });
  test('all messages are non-empty and distinct per category in both locales', () {
    for (final l in [bn, en]) {
      final msgs = [
        l.apiErrorOffline,
        l.apiErrorSessionExpired,
        l.apiErrorForbidden,
        l.apiErrorNotFound,
        l.apiErrorConflict,
        l.apiErrorFileTooLarge,
        l.apiErrorInvalidInput,
        l.apiErrorTooManyRequests,
        l.apiErrorServer,
        l.apiErrorUnknown,
      ];
      expect(msgs.every((m) => m.trim().isNotEmpty), isTrue);
      expect(msgs.toSet().length, msgs.length);
    }
  });
}
