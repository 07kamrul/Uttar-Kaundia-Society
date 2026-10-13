import '../../l10n/app_localizations.dart';
import '../../shared/utils/file_utils.dart';
import 'api_exception.dart';

/// Maps any error to a plain-language, localized message. Raw server detail
/// (`ApiException.message`/`businessMessage`) is intentionally never shown.
String apiErrorMessage(AppLocalizations l10n, Object error) {
  if (error is FileTooLargeError) return l10n.apiErrorFileTooLarge;
  if (error is! ApiException) return l10n.apiErrorUnknown;
  if (error.isNetwork) return l10n.apiErrorOffline;

  final code = error.statusCode;
  if (code == null) return l10n.apiErrorUnknown;
  return switch (code) {
    401 => l10n.apiErrorSessionExpired,
    403 => l10n.apiErrorForbidden,
    404 => l10n.apiErrorNotFound,
    409 => l10n.apiErrorConflict,
    413 => l10n.apiErrorFileTooLarge,
    400 || 422 => l10n.apiErrorInvalidInput,
    429 => l10n.apiErrorTooManyRequests,
    >= 500 && < 600 => l10n.apiErrorServer,
    _ => l10n.apiErrorUnknown,
  };
}
