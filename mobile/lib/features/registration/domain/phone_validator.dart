import '../../../core/phone/phone.dart';

/// International phone validation mirroring Angular phone-number.ts
/// (isValidInternationalPhone with DEFAULT_PHONE_COUNTRY 'BD').
///
/// Backed by the shared parser in core/phone: valid numbers and plausible
/// "possible" numbers pass (the phone field only warns for the latter); numbers
/// that cannot exist fail. Legacy national values are read as Bangladeshi.
bool isValidInternationalPhone(String? value) {
  final raw = (value ?? '').trim();
  if (raw.isEmpty) return false;
  return normalizePhone(raw).status != PhoneStatus.invalid;
}
