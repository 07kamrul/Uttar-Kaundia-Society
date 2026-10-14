import '../../l10n/app_localizations.dart';
import '../../shared/utils/file_utils.dart';
import 'api_exception.dart';

/// Maps any error to a plain-language, localized message. Raw server detail
/// (`ApiException.message`/`businessMessage`) is intentionally never shown.
String apiErrorMessage(AppLocalizations l10n, Object error) {
  if (error is FileTooLargeError) return l10n.apiErrorFileTooLarge;
  if (error is! ApiException) return l10n.apiErrorUnknown;
  if (error.isNetwork) return l10n.apiErrorOffline;

  final byCode = apiErrorCodeMessage(l10n, error.errorCode);
  if (byCode != null) return byCode;

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

/// Plain-language message for the structured `detail.code` values the server
/// sends on 422 (PHOTO_REQUIRED, PROPERTY_PROOF_REQUIRED) and 409
/// (DAG_REQUIRED) and the Batch 2/3 payment and helpline codes; null for any other code so the status mapping applies.
String? apiErrorCodeMessage(AppLocalizations l10n, String? code) => switch (code) {
      'PHOTO_REQUIRED' => l10n.apiErrorPhotoRequired,
      'PROPERTY_PROOF_REQUIRED' => l10n.apiErrorPropertyProofRequired,
      'DAG_REQUIRED' || 'DAG_REQUIRED_FIELD' => l10n.apiErrorDagRequired,
      'ABROAD_ADDRESS_REQUIRED' => l10n.apiErrorAbroadAddressRequired,
      'SHARE_NOT_FOUND' => l10n.apiErrorShareNotFound,
      'SHARE_ALREADY_PAID' => l10n.apiErrorShareAlreadyPaid,
      'DUPLICATE_TRANSACTION_REF' => l10n.apiErrorDuplicateTransactionRef,
      'AMOUNT_EXCEEDS_REMAINING' => l10n.apiErrorAmountExceedsRemaining,
      'PHONE_DUPLICATE' => l10n.apiErrorPhoneDuplicate,
      'PHONE_FIX_ALREADY_RESOLVED' => l10n.apiErrorPhoneFixAlreadyResolved,
      'PHONE_FIX_NOT_FOUND' => l10n.apiErrorPhoneFixNotFound,
      'PHONE_FIX_TARGET_NOT_FOUND' => l10n.apiErrorPhoneFixTargetNotFound,
      'FEE_ALREADY_PAID' => l10n.apiErrorFeeAlreadyPaid,
      'ALREADY_REVIEWED' => l10n.apiErrorAlreadyReviewed,
      'NOT_PENDING' => l10n.apiErrorNotPending,
      'REFERENCE_REQUIRED' => l10n.apiErrorReferenceRequired,
      'FEATURE_DISABLED' => l10n.apiErrorFeatureDisabled,
      'INVALID_BD_MOBILE' => l10n.apiErrorInvalidBdMobile,
      'LOGIN_AMBIGUOUS_IDENTIFIER' => l10n.apiErrorLoginAmbiguous,
      'PASSWORD_TOO_SHORT' => l10n.apiErrorPasswordTooShort,
      'PASSWORD_TOO_COMMON' => l10n.apiErrorPasswordTooCommon,
      'PASSWORD_SAME_AS_CURRENT' => l10n.apiErrorPasswordSameAsCurrent,
      _ => null,
    };
