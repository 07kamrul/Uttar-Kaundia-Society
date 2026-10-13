/// International phone handling shared by forms and contact buttons. Mirrors
/// frontend/src/app/shared/phone-input/{phone-number,contact-links}.ts.
///
/// Stored values are E.164 ("+8801712345678"); legacy national values
/// ("01712345678") are read as the default country (Bangladesh). Input may use
/// Bangla digits, spaces/dashes/dots/parentheses and "+" or "00" international
/// prefixes. Pure Dart: no Flutter imports, so it is trivially unit-testable.
///
/// Not for the society's own bKash/Nagad/bank numbers - those stay BD-only via
/// `normalizeBdMobile` in core/validation/bd_input.dart.
library;

import 'package:phone_numbers_parser/metadata.dart';
import 'package:phone_numbers_parser/phone_numbers_parser.dart';

import '../format/bn_format.dart';
import '../validation/bd_input.dart' show toAsciiDigits;

/// Country preselected in pickers and assumed for numbers typed without a
/// leading "+". Must match DEFAULT_PHONE_REGION in the backend normalization.
const String defaultPhoneIso = 'BD';

/// E.164 allows at most 15 digits (country code included).
const int _maxE164Digits = 15;

final RegExp _separators = RegExp('[\\s\\-(). ​‎‏]');
final RegExp _optionalTrunkZero = RegExp(r'\(\s*0\s*\)');
final RegExp _plusDigits = RegExp(r'^\+?\d+$');
final RegExp _simpleTrunkPrefix = RegExp(r'^\d+$');

/// How trustworthy a parsed number is.
enum PhoneStatus {
  /// Matches a known numbering plan for its country.
  valid,

  /// Plausible length for the country but not a known range (non-blocking).
  possible,

  /// Cannot be a phone number.
  invalid,
}

/// Result of [normalizePhone]. [e164] is non-null exactly when [status] is
/// not [PhoneStatus.invalid].
class PhoneParseResult {
  const PhoneParseResult({
    required this.e164,
    required this.status,
    this.isoCode,
    this.callingCode,
    this.nationalNumber,
  });

  static const PhoneParseResult invalid = PhoneParseResult(e164: null, status: PhoneStatus.invalid);

  /// "+8801712345678", or null when [status] is [PhoneStatus.invalid].
  final String? e164;
  final PhoneStatus status;

  /// Region the number belongs to ("BD"), when it could be determined.
  final String? isoCode;

  /// Country calling code without "+" ("880").
  final String? callingCode;

  /// National significant number without trunk prefix ("1712345678").
  final String? nationalNumber;

  /// True when a call / WhatsApp link may be built. Only [PhoneStatus.valid]
  /// numbers qualify: a typo'd number must not open a dialer for a stranger.
  bool get isDialable => status == PhoneStatus.valid;

  @override
  bool operator ==(Object other) =>
      other is PhoneParseResult &&
      other.e164 == e164 &&
      other.status == status &&
      other.isoCode == isoCode;

  @override
  int get hashCode => Object.hash(e164, status, isoCode);

  @override
  String toString() => 'PhoneParseResult($e164, $status, $isoCode)';
}

IsoCode _isoOrDefault(String iso) =>
    IsoCode.values.asNameMap()[iso.trim().toUpperCase()] ?? IsoCode.BD;

/// Main region of a calling code ("44" -> "GB", "1" -> "US"), or null.
String? mainIsoForCallingCode(String callingCode) {
  final isos = countryCodeToIsoCode[callingCode];
  return isos == null || isos.isEmpty ? null : isos.first.name;
}

/// Dial code with plus for a region ("BD" -> "+880").
String dialCodeForIso(String iso) => '+${metadataByIsoCode[_isoOrDefault(iso)]!.countryCode}';

PhoneStatus _statusOf(PhoneNumber number) {
  final siblings = countryCodeToIsoCode[number.countryCode] ?? const <IsoCode>[];
  // One calling code can serve several regions (+44 = GB/GG/JE/IM); a number is
  // valid when it fits any of them.
  final regions = {number.isoCode, ...siblings};
  if (regions.any((iso) => PhoneNumber(isoCode: iso, nsn: number.nsn).isValid())) {
    return PhoneStatus.valid;
  }
  if (regions.any((iso) => PhoneNumber(isoCode: iso, nsn: number.nsn).isValidLength())) {
    return PhoneStatus.possible;
  }
  return PhoneStatus.invalid;
}

/// Parses international input (country code included, without the plus).
PhoneParseResult _parseInternational(String digits) {
  if (digits.isEmpty || digits.startsWith('0') || digits.length > _maxE164Digits) {
    return PhoneParseResult.invalid;
  }
  try {
    final number = PhoneNumber.parse('+$digits');
    final status = _statusOf(number);
    if (status == PhoneStatus.invalid || number.international.length - 1 > _maxE164Digits) {
      return PhoneParseResult.invalid;
    }
    return PhoneParseResult(
      e164: number.international,
      status: status,
      isoCode: number.isoCode.name,
      callingCode: number.countryCode,
      nationalNumber: number.nsn,
    );
  } on PhoneNumberException {
    return PhoneParseResult.invalid;
  } on RangeError {
    return PhoneParseResult.invalid;
  }
}

/// Candidate "country code + subscriber digits" readings of a national input:
/// with the trunk prefix dropped, as typed, and with the country code typed
/// without "+".
List<String> _nationalCandidates(String digits, {required String cc, required String? trunk}) {
  return [
    if (trunk != null && _simpleTrunkPrefix.hasMatch(trunk) && digits.startsWith(trunk))
      '$cc${digits.substring(trunk.length)}',
    '$cc$digits',
    if (digits.startsWith(cc)) digits,
  ];
}

int _rank(PhoneStatus status) => switch (status) {
      PhoneStatus.valid => 2,
      PhoneStatus.possible => 1,
      PhoneStatus.invalid => 0,
    };

PhoneParseResult _parseNational(String digits, String iso) {
  var best = PhoneParseResult.invalid;
  final meta = metadataByIsoCode[_isoOrDefault(iso)]!;
  for (final candidate in _nationalCandidates(digits, cc: meta.countryCode, trunk: meta.nationalPrefix)) {
    final result = _parseInternational(candidate);
    if (_rank(result.status) > _rank(best.status)) best = result;
    if (best.status == PhoneStatus.valid) break;
  }
  return best;
}

/// Cleans [input] (Bangla digits, separators) to `+?digits`, or null when it
/// contains anything else.
String? _clean(String input) {
  var ascii = toAsciiDigits(input).trimLeft();
  // "+44 (0)7911 ..." writes the trunk 0 in parentheses; it is not dialled
  // internationally.
  if (ascii.startsWith('+') || ascii.startsWith('00')) {
    ascii = ascii.replaceAll(_optionalTrunkZero, '');
  }
  final cleaned = ascii.replaceAll(_separators, '');
  return _plusDigits.hasMatch(cleaned) ? cleaned : null;
}

/// Parses any user-typed or stored phone number.
///
/// Numbers without "+" / "00" are read as national numbers of [defaultIso]
/// (leading trunk "0" dropped per country). Never throws.
PhoneParseResult normalizePhone(String input, {String defaultIso = defaultPhoneIso}) {
  final cleaned = _clean(input);
  if (cleaned == null) return PhoneParseResult.invalid;
  if (cleaned.startsWith('+')) return _parseInternational(cleaned.substring(1));
  if (cleaned.startsWith('00')) return _parseInternational(cleaned.substring(2));
  return _parseNational(cleaned, defaultIso);
}

/// Combines the picker's country with what the user typed. Returns E.164 when
/// the number parses; otherwise a best-effort plus, calling code and digits so validators
/// can still flag it instead of the field looking empty. Empty input gives ''.
String composePhone(String iso, String input) {
  final trimmed = input.trim();
  if (trimmed.isEmpty) return '';
  final parsed = normalizePhone(trimmed, defaultIso: iso);
  if (parsed.e164 != null) return parsed.e164!;
  final ascii = toAsciiDigits(trimmed);
  final digits = ascii.replaceAll(RegExp(r'\D'), '');
  final international = ascii.trimLeft().startsWith('+');
  if (international) return '+$digits';
  final cc = metadataByIsoCode[_isoOrDefault(iso)]!.countryCode;
  return '+$cc$digits';
}

/// Country + text for a stored value, used to seed a phone input.
class PhoneSplit {
  const PhoneSplit({required this.iso, required this.nationalNumber});

  final String iso;
  final String nationalNumber;
}

/// Splits a stored value (E.164 or legacy national) for display in a picker +
/// number field. Numbers without "+" are read as [fallbackIso] numbers. The
/// picker keeps [preferredIso] (default [fallbackIso]) when its calling code
/// matches, so +44 stays GB rather than jumping to Guernsey for 07911 numbers.
PhoneSplit splitPhone(String? value, {String fallbackIso = defaultPhoneIso, String? preferredIso}) {
  final raw = (value ?? '').trim();
  final preferred = preferredIso ?? fallbackIso;
  if (raw.isEmpty) return PhoneSplit(iso: preferred, nationalNumber: '');
  final parsed = normalizePhone(raw, defaultIso: fallbackIso);
  final cc = parsed.callingCode;
  if (parsed.e164 == null || cc == null) {
    return PhoneSplit(iso: preferred, nationalNumber: toAsciiDigits(raw).replaceAll(RegExp(r'\D'), ''));
  }
  final iso = isoForCallingCode(cc, preferred: preferred);
  final trunk = metadataByIsoCode[_isoOrDefault(iso)]!.nationalPrefix;
  final nsn = parsed.nationalNumber ?? '';
  final withTrunk = trunk != null && _simpleTrunkPrefix.hasMatch(trunk) ? '$trunk$nsn' : nsn;
  return PhoneSplit(iso: iso, nationalNumber: withTrunk);
}

/// Region to show for [callingCode]: [preferred] when it uses that code,
/// otherwise the code's main region.
String isoForCallingCode(String callingCode, {String preferred = defaultPhoneIso}) {
  final preferredIso = _isoOrDefault(preferred);
  if (metadataByIsoCode[preferredIso]!.countryCode == callingCode) return preferredIso.name;
  return mainIsoForCallingCode(callingCode) ?? preferredIso.name;
}

/// Human-readable international form: "+880 1712-345678". Digits become Bangla
/// when [lang] is 'bn'. Unparseable input is returned trimmed and unchanged.
String formatPhoneInternational(String? e164OrLegacy, {String lang = 'bn'}) {
  final raw = (e164OrLegacy ?? '').trim();
  if (raw.isEmpty) return '';
  final parsed = normalizePhone(raw);
  final e164 = parsed.e164;
  final cc = parsed.callingCode;
  final nsn = parsed.nationalNumber;
  if (e164 == null || cc == null || nsn == null) return raw;
  final number = PhoneNumber(isoCode: _isoOrDefault(parsed.isoCode ?? defaultPhoneIso), nsn: nsn);
  final formatted = number.formatNsn(format: NsnFormat.international);
  return bnNumber('+$cc $formatted', locale: lang);
}

/// Bare international digits ("8801712345678"), or null when not dialable
/// (see [PhoneParseResult.isDialable]).
String? toInternationalDigits(String? phone) {
  if (phone == null) return null;
  final parsed = normalizePhone(phone);
  return parsed.isDialable ? parsed.e164!.substring(1) : null;
}

/// `tel:+<digits>` for the platform dialer, or null.
Uri? telUri(String? phone) {
  final digits = toInternationalDigits(phone);
  return digits == null ? null : Uri(scheme: 'tel', path: '+$digits');
}

/// `https://wa.me/<digits>` click-to-chat link, or null.
Uri? whatsAppUri(String? phone) {
  final digits = toInternationalDigits(phone);
  return digits == null ? null : Uri.https('wa.me', '/$digits');
}

/// Why a phone value fails validation. Presentation maps this to l10n.
enum PhoneErrorKind { required, invalid }

/// Blocking error for [value], or null. Empty is fine unless [required];
/// possible-but-unknown numbers do not block (see [isPhoneWarning]).
PhoneErrorKind? phoneErrorKind(String? value, {bool required = true, String defaultIso = defaultPhoneIso}) {
  if (value == null || value.trim().isEmpty) return required ? PhoneErrorKind.required : null;
  return normalizePhone(value, defaultIso: defaultIso).status == PhoneStatus.invalid
      ? PhoneErrorKind.invalid
      : null;
}

/// True when [value] is plausible but not a known valid number (non-blocking).
bool isPhoneWarning(String? value, {String defaultIso = defaultPhoneIso}) {
  if (value == null || value.trim().isEmpty) return false;
  return normalizePhone(value, defaultIso: defaultIso).status == PhoneStatus.possible;
}

/// A sample national mobile number for [iso] to use as an input hint
/// ("01812345678" for BD), or '' when the metadata has none.
String phoneExampleHint(String iso) {
  final code = _isoOrDefault(iso);
  final nsn = metadataExamplesByIsoCode[code]?.mobile ?? '';
  if (nsn.isEmpty) return '';
  final trunk = metadataByIsoCode[code]!.nationalPrefix;
  return trunk != null && _simpleTrunkPrefix.hasMatch(trunk) ? '$trunk$nsn' : nsn;
}
