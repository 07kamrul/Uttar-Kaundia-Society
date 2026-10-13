import '../../l10n/app_localizations.dart';

/// Input normalisation and form validators for Bangladeshi data entry.
/// `normalizeBdMobile` / `mobileValidator` are BD-only: use them for the
/// society's own bKash/Nagad/bank numbers. Member, nominee and contact phones
/// are international - use core/phone/phone.dart and the PhoneField widget.
/// Users type Bangla or English digits, with spaces/dashes and +880 prefixes;
/// everything is normalised before validation so none of that is an error.

typedef FieldValidator = String? Function(String? value);

/// Converts Bangla (০-৯) and Arabic-Indic (٠-٩) digits to ASCII 0-9.
String toAsciiDigits(String input) {
  final b = StringBuffer();
  for (final unit in input.codeUnits) {
    if (unit >= 0x09E6 && unit <= 0x09EF) {
      b.writeCharCode(0x30 + unit - 0x09E6);
    } else if (unit >= 0x0660 && unit <= 0x0669) {
      b.writeCharCode(0x30 + unit - 0x0660);
    } else {
      b.writeCharCode(unit);
    }
  }
  return b.toString();
}

final _separators = RegExp(r'[\s\-().]');
final _bdMobile = RegExp(r'^01[3-9]\d{8}$');

/// Returns the canonical `01XXXXXXXXX` mobile number, or null when [input] is
/// not a valid Bangladeshi mobile. Accepts 01…, +8801…, 8801…, 008801…, with
/// spaces, dashes, dots, parentheses and Bangla digits.
String? normalizeBdMobile(String? input) {
  if (input == null) return null;
  var s = toAsciiDigits(input).replaceAll(_separators, '');
  if (s.startsWith('+')) s = s.substring(1);
  if (s.isEmpty || !RegExp(r'^\d+$').hasMatch(s)) return null;
  if (s.startsWith('00880')) s = s.substring(2);
  if (s.startsWith('880') && s.length == 13) s = '0${s.substring(3)}';
  return _bdMobile.hasMatch(s) ? s : null;
}

/// National ID: 10, 13 or 17 digits (spaces and Bangla digits allowed).
bool isValidNid(String? input) {
  if (input == null) return false;
  final s = toAsciiDigits(input).replaceAll(RegExp(r'\s'), '');
  return RegExp(r'^(\d{10}|\d{13}|\d{17})$').hasMatch(s);
}

bool _isBlank(String? v) => v == null || v.trim().isEmpty;

FieldValidator requiredValidator(AppLocalizations l10n) =>
    (value) => _isBlank(value) ? l10n.validationFieldRequired : null;

FieldValidator mobileValidator(AppLocalizations l10n, {bool required = true}) => (value) {
      if (_isBlank(value)) return required ? l10n.validationMobileRequired : null;
      return normalizeBdMobile(value) == null ? l10n.validationMobileInvalid : null;
    };

FieldValidator nidValidator(AppLocalizations l10n, {bool required = true}) => (value) {
      if (_isBlank(value)) return required ? l10n.validationNidRequired : null;
      return isValidNid(value) ? null : l10n.validationNidInvalid;
    };
