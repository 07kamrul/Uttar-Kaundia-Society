import '../../../core/network/api_error_messages.dart';
import '../../../core/network/api_exception.dart';
import '../../../l10n/app_localizations.dart';

/// What the member was doing when a request failed. The backend sends plain
/// text (no `detail.code`) for these, so the HTTP status picks the message; the
/// server text itself is never shown.
enum GovAction { vote, nominate, sign, createPetition, landComplaint, welfare, withdraw, other }

String govErrorMessage(AppLocalizations l10n, Object error, GovAction action) {
  if (error is ApiException && !error.isNetwork) {
    final byCode = apiErrorCodeMessage(l10n, error.errorCode);
    if (byCode != null) return byCode;
    final specific = _byStatus(l10n, error.statusCode, action);
    if (specific != null) return specific;
  }
  return apiErrorMessage(l10n, error);
}

String? _byStatus(AppLocalizations l10n, int? status, GovAction action) => switch ((action, status)) {
      (GovAction.vote, 403) => l10n.govErrVoteForbidden,
      (GovAction.vote, 409) => l10n.govErrVoteConflict,
      (GovAction.nominate, 403) => l10n.govErrNominateForbidden,
      (GovAction.nominate, 409) => l10n.govErrNominateConflict,
      (GovAction.sign, 403) => l10n.govErrSignForbidden,
      (GovAction.sign, 409) => l10n.govErrSignConflict,
      (GovAction.sign, 404) => l10n.govErrSignNotFound,
      (GovAction.createPetition, 403) => l10n.govErrPetitionForbidden,
      (GovAction.landComplaint, 422) => l10n.govErrLandMissing,
      (GovAction.welfare, 409) => l10n.govErrWelfareConflict,
      (GovAction.withdraw, 409) => l10n.govErrWithdrawConflict,
      _ => null,
    };
