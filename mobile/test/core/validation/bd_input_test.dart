import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/core/validation/bd_input.dart';
import 'package:kaundia_app/l10n/app_localizations_bn.dart';
import 'package:kaundia_app/l10n/app_localizations_en.dart';

void main() {
  group('toAsciiDigits', () {
    test('converts Bangla digits', () => expect(toAsciiDigits('০১৭১২৩৪৫৬৭৮'), '01712345678'));
    test('converts Arabic-Indic digits', () => expect(toAsciiDigits('٠١٢٣'), '0123'));
    test('leaves other characters alone', () => expect(toAsciiDigits('+৮৮০-1 a'), '+880-1 a'));
    test('empty', () => expect(toAsciiDigits(''), ''));
  });

  group('normalizeBdMobile', () {
    test('plain 11-digit', () => expect(normalizeBdMobile('01712345678'), '01712345678'));
    test('+880 prefix', () => expect(normalizeBdMobile('+8801712345678'), '01712345678'));
    test('880 prefix', () => expect(normalizeBdMobile('8801712345678'), '01712345678'));
    test('00880 prefix', () => expect(normalizeBdMobile('008801712345678'), '01712345678'));
    test('spaces, dashes, parens, dots', () {
      expect(normalizeBdMobile(' 017 1234-5678 '), '01712345678');
      expect(normalizeBdMobile('+880 1712-345678'), '01712345678');
      expect(normalizeBdMobile('(017) 12.34.56.78'), '01712345678');
    });
    test('Bangla digits', () {
      expect(normalizeBdMobile('০১৭১২৩৪৫৬৭৮'), '01712345678');
      expect(normalizeBdMobile('+৮৮০১৭১২৩৪৫৬৭৮'), '01712345678');
    });
    test('every valid operator prefix 013-019', () {
      for (final p in ['013', '014', '015', '016', '017', '018', '019']) {
        expect(normalizeBdMobile('${p}12345678'), '${p}12345678');
      }
    });
    test('rejects invalid input', () {
      expect(normalizeBdMobile(null), isNull);
      expect(normalizeBdMobile(''), isNull);
      expect(normalizeBdMobile('   '), isNull);
      expect(normalizeBdMobile('0171234567'), isNull); // 10 digits
      expect(normalizeBdMobile('017123456789'), isNull); // 12 digits
      expect(normalizeBdMobile('01012345678'), isNull); // 010 is not a mobile prefix
      expect(normalizeBdMobile('01212345678'), isNull);
      expect(normalizeBdMobile('02712345678'), isNull);
      expect(normalizeBdMobile('+9191234567890'), isNull);
      expect(normalizeBdMobile('+88017123456'), isNull);
      expect(normalizeBdMobile('abc'), isNull);
      expect(normalizeBdMobile('0171234567a'), isNull);
      expect(normalizeBdMobile('017+1234567'), isNull); // plus only allowed at start
    });
  });

  group('isValidNid', () {
    test('accepts 10, 13 and 17 digits', () {
      expect(isValidNid('1234567890'), isTrue);
      expect(isValidNid('1234567890123'), isTrue);
      expect(isValidNid('12345678901234567'), isTrue);
    });
    test('accepts Bangla digits and spaces', () {
      expect(isValidNid('১২৩৪৫৬৭৮৯০'), isTrue);
      expect(isValidNid('123 456 7890'), isTrue);
    });
    test('rejects other lengths, letters and empty', () {
      for (final v in [
        '',
        '123456789',
        '12345678901',
        '123456789012',
        '12345678901234',
        '1234567890123456',
        '123456789012345678',
        '12345abcde',
        '1234-56789',
      ]) {
        expect(isValidNid(v), isFalse, reason: v);
      }
      expect(isValidNid(null), isFalse);
    });
  });

  group('validators (Bangla)', () {
    final l = AppLocalizationsBn();
    test('mobile: empty -> required (when required)', () {
      expect(mobileValidator(l)(''), l.validationMobileRequired);
      expect(mobileValidator(l)(null), l.validationMobileRequired);
    });
    test('mobile: empty ok when optional', () {
      expect(mobileValidator(l, required: false)('  '), isNull);
    });
    test('mobile: invalid -> says what is wrong and gives an example', () {
      final msg = mobileValidator(l)('0171')!;
      expect(msg, l.validationMobileInvalid);
      expect(msg, contains('১১ সংখ্যার'));
      expect(msg, contains('০১৭XXXXXXXX'));
    });
    test('mobile: valid -> null', () {
      expect(mobileValidator(l)('+৮৮০১৭১২৩৪৫৬৭৮'), isNull);
    });
    test('mobile: optional but present and invalid still errors', () {
      expect(mobileValidator(l, required: false)('12'), l.validationMobileInvalid);
    });
    test('nid', () {
      expect(nidValidator(l)(''), l.validationNidRequired);
      expect(nidValidator(l)('123'), l.validationNidInvalid);
      expect(nidValidator(l)('1234567890'), isNull);
      expect(nidValidator(l, required: false)(''), isNull);
    });
    test('required', () {
      expect(requiredValidator(l)('  '), l.validationFieldRequired);
      expect(requiredValidator(l)(null), l.validationFieldRequired);
      expect(requiredValidator(l)('x'), isNull);
    });
  });

  group('validators (English)', () {
    final l = AppLocalizationsEn();
    test('mobile invalid message is plain English with example', () {
      expect(mobileValidator(l)('x'), l.validationMobileInvalid);
      expect(l.validationMobileInvalid, contains('017XXXXXXXX'));
    });
    test('nid invalid message lists accepted lengths', () {
      expect(l.validationNidInvalid, allOf(contains('10'), contains('13'), contains('17')));
    });
  });
}
