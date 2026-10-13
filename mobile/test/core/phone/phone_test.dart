import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/core/phone/phone.dart';

void main() {
  group('normalizePhone - Bangladesh (default)', () {
    const cases = <String, String>{
      '01712345678': '+8801712345678',
      '+8801712345678': '+8801712345678',
      '8801712345678': '+8801712345678',
      '008801712345678': '+8801712345678',
      '1712345678': '+8801712345678',
      '০১৭১২৩৪৫৬৭৮': '+8801712345678',
      '+৮৮০১৭১২৩৪৫৬৭৮': '+8801712345678',
      '01712 345 678': '+8801712345678',
      '01712-345-678': '+8801712345678',
      '(0171) 234.5678': '+8801712345678',
      '+880 1712-345678': '+8801712345678',
      '  +880 (1712) 345-678  ': '+8801712345678',
    };
    cases.forEach((input, expected) {
      test('"$input" -> $expected (valid)', () {
        final r = normalizePhone(input);
        expect(r.e164, expected);
        expect(r.status, PhoneStatus.valid);
      });
    });
  });

  group('normalizePhone - international input', () {
    test('Saudi number with spaces', () {
      final r = normalizePhone('+966 50 123 4567');
      expect(r.e164, '+966501234567');
      expect(r.status, PhoneStatus.valid);
      expect(r.isoCode, 'SA');
    });

    test('00 international prefix with spaces', () {
      final r = normalizePhone('0044 7911 123456');
      expect(r.e164, '+447911123456');
      expect(r.status, PhoneStatus.valid);
    });

    test('dashes, dots and parentheses are ignored', () {
      expect(normalizePhone('+44 (0)7911-123.456').e164, '+447911123456');
      expect(normalizePhone('+1 (202) 555-0123').e164, '+12025550123');
    });

    test('Bangla digits work for foreign numbers too', () {
      expect(normalizePhone('+৯৬৬ ৫০ ১২৩ ৪৫৬৭').e164, '+966501234567');
    });

    test('international number wins over the default country', () {
      expect(normalizePhone('+447911123456', defaultIso: 'BD').e164, '+447911123456');
      expect(normalizePhone('00966501234567', defaultIso: 'GB').e164, '+966501234567');
    });

    test('reports the calling code', () {
      expect(normalizePhone('+966501234567').callingCode, '966');
      expect(normalizePhone('01712345678').callingCode, '880');
    });
  });

  group('normalizePhone - national numbers for other countries', () {
    test('GB 07911123456 -> +447911123456 (national leading 0 dropped)', () {
      final r = normalizePhone('07911123456', defaultIso: 'GB');
      expect(r.e164, '+447911123456');
      expect(r.status, PhoneStatus.valid);
    });

    test('GB without the trunk 0', () {
      expect(normalizePhone('7911 123456', defaultIso: 'GB').e164, '+447911123456');
    });

    test('SA 0501234567 -> +966501234567', () {
      expect(normalizePhone('0501234567', defaultIso: 'SA').e164, '+966501234567');
    });

    test('US has no trunk prefix problem', () {
      expect(normalizePhone('(202) 555-0123', defaultIso: 'US').e164, '+12025550123');
    });

    test('country code typed without plus is recognised', () {
      expect(normalizePhone('966501234567', defaultIso: 'SA').e164, '+966501234567');
    });

    test('default country is case-insensitive', () {
      expect(normalizePhone('07911123456', defaultIso: 'gb').e164, '+447911123456');
    });
  });

  group('normalizePhone - invalid', () {
    const junk = <String?>[
      '',
      '   ',
      '+',
      'abc',
      'not a number',
      '12345',
      '+88017',
      '+0123456789',
      '+999123456',
      '+1234567890123456',
      '017123456789012345',
      '+880 1712 345 67x',
    ];
    for (final input in junk) {
      test('"$input" is invalid with no e164', () {
        final r = normalizePhone(input ?? '');
        expect(r.status, PhoneStatus.invalid);
        expect(r.e164, isNull);
      });
    }

    test('emoji and symbols are invalid, never throw', () {
      expect(normalizePhone('\u{1F4DE}').status, PhoneStatus.invalid);
      expect(normalizePhone("'; DROP TABLE x;--").status, PhoneStatus.invalid);
    });

    test('unknown default country falls back to BD', () {
      expect(normalizePhone('01712345678', defaultIso: 'ZZ').e164, '+8801712345678');
    });
  });

  group('normalizePhone - possible tier', () {
    test('right length but not an assigned BD mobile range is possible', () {
      // 12 is not a BD mobile operator range, but the length is plausible.
      final r = normalizePhone('+8801212345678');
      expect(r.status, PhoneStatus.possible);
      expect(r.e164, '+8801212345678');
    });

    test('possible numbers also work from national form', () {
      final r = normalizePhone('01212345678');
      expect(r.status, PhoneStatus.possible);
      expect(r.e164, '+8801212345678');
    });

    test('only valid numbers are dialable (call / WhatsApp links)', () {
      expect(normalizePhone('01712345678').isDialable, isTrue);
      expect(normalizePhone('+8801212345678').isDialable, isFalse);
      expect(normalizePhone('12345').isDialable, isFalse);
      expect(telUri('+8801212345678'), isNull);
      expect(whatsAppUri('+8801212345678'), isNull);
      expect(toInternationalDigits('0171234567'), isNull);
    });
  });

  group('composePhone (best-effort value the field emits)', () {
    test('empty input gives empty string', () {
      expect(composePhone('BD', ''), '');
      expect(composePhone('BD', '  '), '');
    });

    test('valid input gives E.164', () {
      expect(composePhone('BD', '01712345678'), '+8801712345678');
      expect(composePhone('GB', '07911 123456'), '+447911123456');
    });

    test('invalid input keeps a +<code><digits> value so validators can flag it', () {
      expect(composePhone('BD', '12345'), '+88012345');
      expect(normalizePhone(composePhone('BD', '12345')).status, PhoneStatus.invalid);
    });

    test('pasted international number overrides the selected country', () {
      expect(composePhone('BD', '+966 50 123 4567'), '+966501234567');
    });

    test('letters-only input does not look like an empty value', () {
      expect(composePhone('BD', 'abc'), '+880');
    });
  });

  group('formatPhoneInternational', () {
    test('formats E.164 for English', () {
      expect(formatPhoneInternational('+8801712345678', lang: 'en'), '+880 1712-345678');
      expect(formatPhoneInternational('+966501234567', lang: 'en'), '+966 50 123 4567');
      expect(formatPhoneInternational('+447911123456', lang: 'en'), '+44 7911 123456');
    });

    test('uses Bangla digits for bn', () {
      expect(formatPhoneInternational('+8801712345678', lang: 'bn'), '+৮৮০ ১৭১২-৩৪৫৬৭৮');
    });

    test('reads legacy national values as Bangladeshi', () {
      expect(formatPhoneInternational('01712345678', lang: 'en'), '+880 1712-345678');
      expect(formatPhoneInternational('০১৭১২৩৪৫৬৭৮', lang: 'en'), '+880 1712-345678');
    });

    test('unparseable input is returned unchanged (trimmed)', () {
      expect(formatPhoneInternational(' call me ', lang: 'en'), 'call me');
      expect(formatPhoneInternational('', lang: 'en'), '');
    });
  });

  group('uris', () {
    test('telUri builds tel:+digits', () {
      expect(telUri('01712345678').toString(), 'tel:+8801712345678');
      expect(telUri('+966 50 123 4567').toString(), 'tel:+966501234567');
      expect(telUri('0044 7911 123456').toString(), 'tel:+447911123456');
    });

    test('whatsAppUri builds https://wa.me/<digits> without plus', () {
      expect(whatsAppUri('+8801712345678').toString(), 'https://wa.me/8801712345678');
      expect(whatsAppUri('০১৭১২৩৪৫৬৭৮').toString(), 'https://wa.me/8801712345678');
      expect(whatsAppUri('+966501234567').toString(), 'https://wa.me/966501234567');
    });

    test('unusable input gives null', () {
      expect(telUri(null), isNull);
      expect(telUri(''), isNull);
      expect(telUri('abc'), isNull);
      expect(whatsAppUri(null), isNull);
      expect(whatsAppUri('12345'), isNull);
    });

    test('toInternationalDigits is bare digits', () {
      expect(toInternationalDigits('+8801712345678'), '8801712345678');
      expect(toInternationalDigits('01712345678'), '8801712345678');
      expect(toInternationalDigits('+447911123456'), '447911123456');
      expect(toInternationalDigits(null), isNull);
    });
  });

  group('phoneValidator', () {
    test('blank is ok unless required', () {
      expect(phoneErrorKind('', required: false), isNull);
      expect(phoneErrorKind('  ', required: true), PhoneErrorKind.required);
      expect(phoneErrorKind(null, required: true), PhoneErrorKind.required);
    });

    test('invalid blocks', () {
      expect(phoneErrorKind('12345'), PhoneErrorKind.invalid);
      expect(phoneErrorKind('+88017'), PhoneErrorKind.invalid);
    });

    test('possible does not block but warns', () {
      expect(phoneErrorKind('+8801212345678'), isNull);
      expect(isPhoneWarning('+8801212345678'), isTrue);
      expect(isPhoneWarning('+8801712345678'), isFalse);
      expect(isPhoneWarning('12345'), isFalse);
    });

    test('valid has no error', () {
      expect(phoneErrorKind('+8801712345678'), isNull);
    });
  });

  group('splitPhone / helpers', () {
    test('splits E.164 into country and national text with trunk prefix', () {
      final bd = splitPhone('+8801712345678');
      expect(bd.iso, 'BD');
      expect(bd.nationalNumber, '01712345678');
      final sa = splitPhone('+966501234567');
      expect(sa.iso, 'SA');
      expect(sa.nationalNumber, '0501234567');
    });

    test('keeps the preferred region for a shared calling code', () {
      expect(splitPhone('+447911123456').iso, 'GB');
      expect(splitPhone('+447911123456', preferredIso: 'GB').iso, 'GB');
      expect(splitPhone('+12025550123').iso, 'US');
      expect(splitPhone('+12425551234', preferredIso: 'US').iso, 'US');
    });

    test('empty gives the fallback country and empty text', () {
      final s = splitPhone('', fallbackIso: 'GB');
      expect(s.iso, 'GB');
      expect(s.nationalNumber, '');
      expect(splitPhone(null).iso, 'BD');
    });

    test('unparseable text keeps its digits only', () {
      expect(splitPhone('12345').nationalNumber, '12345');
      expect(splitPhone('abc 12').nationalNumber, '12');
    });

    test('dial codes and main regions', () {
      expect(dialCodeForIso('BD'), '+880');
      expect(dialCodeForIso('us'), '+1');
      expect(mainIsoForCallingCode('44'), 'GB');
      expect(mainIsoForCallingCode('1'), 'US');
      expect(mainIsoForCallingCode('999'), isNull);
      expect(isoForCallingCode('1', preferred: 'CA'), 'CA');
      expect(isoForCallingCode('44', preferred: 'BD'), 'GB');
    });

    test('example hint is a national mobile number with trunk prefix', () {
      expect(phoneExampleHint('BD'), startsWith('01'));
      expect(normalizePhone(phoneExampleHint('BD')).status, PhoneStatus.valid);
      expect(normalizePhone(phoneExampleHint('GB'), defaultIso: 'GB').status, PhoneStatus.valid);
      expect(normalizePhone(phoneExampleHint('SA'), defaultIso: 'SA').status, PhoneStatus.valid);
    });
  });

  group('pinned-country examples round trip', () {
    const examples = <String, String>{
      'SA': '+966501234567',
      'AE': '+971501234567',
      'MY': '+60123456789',
      'SG': '+6591234567',
      'GB': '+447911123456',
      'US': '+12025550123',
      'IT': '+393123456789',
      'MV': '+9607771234',
      'JP': '+819012345678',
      'AU': '+61412345678',
    };
    examples.forEach((iso, e164) {
      test('$iso: split then compose returns the same E.164', () {
        final split = splitPhone(e164);
        expect(composePhone(split.iso, split.nationalNumber), e164);
        expect(normalizePhone(e164).status, PhoneStatus.valid);
      });
    });
  });
}
