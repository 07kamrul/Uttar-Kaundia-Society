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
  batch2Codes();
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

  group('structured detail codes', () {
    ApiException coded(int status, String code) => ApiException(
          type: status == 422 ? ApiExceptionType.validation : ApiExceptionType.server,
          statusCode: status,
          errorCode: code,
        );

    test('422 PHOTO_REQUIRED / PROPERTY_PROOF_REQUIRED have their own messages', () {
      for (final l in [bn, en]) {
        expect(apiErrorMessage(l, coded(422, 'PHOTO_REQUIRED')), l.apiErrorPhotoRequired);
        expect(apiErrorMessage(l, coded(422, 'PROPERTY_PROOF_REQUIRED')),
            l.apiErrorPropertyProofRequired);
        expect(l.apiErrorPhotoRequired, isNot(l.apiErrorInvalidInput));
        expect(l.apiErrorPropertyProofRequired, isNot(l.apiErrorInvalidInput));
      }
    });

    test('409 DAG_REQUIRED is a plain message, not the generic conflict', () {
      for (final l in [bn, en]) {
        final m = apiErrorMessage(l, coded(409, 'DAG_REQUIRED'));
        expect(m, l.apiErrorDagRequired);
        expect(m, isNot(l.apiErrorConflict));
      }
      expect(bn.apiErrorDagRequired, contains('দাগ'));
    });

    test('unknown codes fall back to the status mapping', () {
      expect(apiErrorMessage(bn, coded(409, 'SOMETHING_ELSE')), bn.apiErrorConflict);
      expect(apiErrorMessage(bn, coded(422, 'SOMETHING_ELSE')), bn.apiErrorInvalidInput);
    });
  });
}

void batch2Codes() {
  final bn = AppLocalizationsBn();
  group('Batch 2/3 error codes', () {
    ApiException coded(int status, String code) =>
        ApiException(type: ApiExceptionType.server, statusCode: status, errorCode: code);

    test('maps each new code to its own message', () {
      expect(apiErrorMessage(bn, coded(404, 'SHARE_NOT_FOUND')), bn.apiErrorShareNotFound);
      expect(apiErrorMessage(bn, coded(409, 'SHARE_ALREADY_PAID')), bn.apiErrorShareAlreadyPaid);
      expect(apiErrorMessage(bn, coded(409, 'DUPLICATE_TRANSACTION_REF')), bn.apiErrorDuplicateTransactionRef);
      expect(apiErrorMessage(bn, coded(422, 'AMOUNT_EXCEEDS_REMAINING')), bn.apiErrorAmountExceedsRemaining);
      expect(apiErrorMessage(bn, coded(404, 'FEATURE_DISABLED')), bn.apiErrorFeatureDisabled);
      expect(apiErrorMessage(bn, coded(422, 'INVALID_BD_MOBILE')), bn.apiErrorInvalidBdMobile);
    });
  });
}
