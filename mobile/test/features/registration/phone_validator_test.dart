import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/features/registration/domain/phone_validator.dart';
import 'package:kaundia_app/features/registration/domain/registration_form.dart';
import 'package:kaundia_app/features/registration/domain/registration_validators.dart';

void main() {
  group('isValidInternationalPhone', () {
    test('accepts valid numbers from any country', () {
      expect(isValidInternationalPhone('+8801712345678'), isTrue);
      expect(isValidInternationalPhone('+966501234567'), isTrue);
      expect(isValidInternationalPhone('+447911123456'), isTrue);
      expect(isValidInternationalPhone('+12025550123'), isTrue);
    });

    test('reads legacy national values as Bangladeshi', () {
      expect(isValidInternationalPhone('01712345678'), isTrue);
      expect(isValidInternationalPhone('১৭১২৩৪৫৬৭৮'), isTrue);
    });

    test('possible-but-unknown numbers do not block', () {
      expect(isValidInternationalPhone('+8801212345678'), isTrue);
    });

    test('rejects blank and impossible numbers', () {
      expect(isValidInternationalPhone(null), isFalse);
      expect(isValidInternationalPhone(''), isFalse);
      expect(isValidInternationalPhone('   '), isFalse);
      expect(isValidInternationalPhone('+88017'), isFalse);
      expect(isValidInternationalPhone('12345'), isFalse);
      expect(isValidInternationalPhone('+999123456'), isFalse);
    });
  });

  group('wizard validation uses the shared parser', () {
    test('a foreign urgent contact and nominee are accepted', () {
      final form = RegistrationForm(
        urgentContactName: 'Urgent',
        urgentContactMobile: '+966501234567',
        nominees: const [Nominee(name: 'N', mobile: '+447911123456')],
      );
      final errors = validateContactStep(form).map((e) => e.kind);
      expect(errors, isNot(contains(RegErrorKind.urgentMobileInvalid)));
      expect(errors, isNot(contains(RegErrorKind.nomineeMobileInvalid)));
    });

    test('an impossible nominee number is flagged by index', () {
      final form = RegistrationForm(
        urgentContactName: 'Urgent',
        urgentContactMobile: '+8801712345678',
        nominees: const [
          Nominee(name: 'A', mobile: '+8801712345678'),
          Nominee(name: 'B', mobile: '12345'),
        ],
      );
      final bad = validateContactStep(form).where((e) => e.kind == RegErrorKind.nomineeMobileInvalid);
      expect(bad.map((e) => e.nomineeIndex), [1]);
    });
  });
}
