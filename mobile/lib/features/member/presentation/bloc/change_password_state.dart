part of 'change_password_bloc.dart';

/// Validation error variants surfaced per field (mirrors Angular validators).
enum ChangePasswordFieldError {
  required,
  policy,
  mismatch,
  sameAsCurrent,
  none
}

class ChangePasswordState extends Equatable {
  const ChangePasswordState({
    this.submitting = false,
    this.success = false,
    this.generalError = false,
    this.currentError = ChangePasswordFieldError.none,
    this.newError = ChangePasswordFieldError.none,
    this.confirmError = ChangePasswordFieldError.none,
    this.currentServerError,
    this.newServerError,
    this.newServerCode,
  });

  final bool submitting;
  final bool success;

  /// Non-validation failures (network / server / business).
  final bool generalError;
  final ChangePasswordFieldError currentError;
  final ChangePasswordFieldError newError;
  final ChangePasswordFieldError confirmError;

  /// 422 server field errors keyed to the camelCase control names.
  final String? currentServerError;
  final String? newServerError;

  /// Machine code of the 422 (PASSWORD_TOO_COMMON ...) so the page can show
  /// its own plain-language copy instead of the server's English text.
  final String? newServerCode;

  bool get hasValidationErrors =>
      currentError != ChangePasswordFieldError.none ||
      newError != ChangePasswordFieldError.none ||
      confirmError != ChangePasswordFieldError.none;

  ChangePasswordState copyWith({
    bool? submitting,
    bool? success,
    bool clearGeneralError = false,
    bool? generalError,
    ChangePasswordFieldError? currentError,
    ChangePasswordFieldError? newError,
    ChangePasswordFieldError? confirmError,
    String? currentServerError,
    bool clearServerErrors = false,
    String? newServerError,
    String? newServerCode,
  }) {
    return ChangePasswordState(
      submitting: submitting ?? this.submitting,
      success: success ?? this.success,
      generalError:
          clearGeneralError ? false : (generalError ?? this.generalError),
      currentError: currentError ?? this.currentError,
      newError: newError ?? this.newError,
      confirmError: confirmError ?? this.confirmError,
      currentServerError: clearServerErrors
          ? null
          : (currentServerError ?? this.currentServerError),
      newServerError:
          clearServerErrors ? null : (newServerError ?? this.newServerError),
      newServerCode:
          clearServerErrors ? null : (newServerCode ?? this.newServerCode),
    );
  }

  @override
  List<Object?> get props => [
        submitting,
        success,
        generalError,
        currentError,
        newError,
        confirmError,
        currentServerError,
        newServerError,
        newServerCode,
      ];
}
