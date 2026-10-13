import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/features/member/presentation/bloc/property_request_form_bloc.dart';

PropertyRequestFormState _withCoOwner(String phone, {bool attempted = true}) =>
    PropertyRequestFormState(
      submitAttempted: attempted,
      coOwners: [FormCoOwnerRow(ownerName: 'Rahim', ownerPhone: phone)],
    );

void main() {
  group('co-owner phone validation', () {
    test('a valid international number passes', () {
      expect(_withCoOwner('+8801712345678').coOwnersInvalid, isFalse);
      expect(_withCoOwner('+966501234567').coOwnersInvalid, isFalse);
    });

    test('a legacy national Bangladeshi number passes', () {
      expect(_withCoOwner('01712345678').coOwnersInvalid, isFalse);
    });

    test('a possible-but-unknown number only warns, never blocks', () {
      expect(_withCoOwner('+8801212345678').coOwnersInvalid, isFalse);
    });

    test('an impossible number blocks', () {
      expect(_withCoOwner('12345').coOwnersInvalid, isTrue);
      expect(_withCoOwner('+88017').coOwnersInvalid, isTrue);
    });

    test('an empty phone still blocks', () {
      expect(_withCoOwner('').coOwnersInvalid, isTrue);
    });

    test('nothing is flagged before the first submit attempt', () {
      expect(_withCoOwner('12345', attempted: false).coOwnersInvalid, isFalse);
    });

    test('exposes which rows have a bad phone', () {
      final state = PropertyRequestFormState(
        submitAttempted: true,
        coOwners: const [
          FormCoOwnerRow(ownerName: 'A', ownerPhone: '+8801712345678'),
          FormCoOwnerRow(ownerName: 'B', ownerPhone: '12345'),
        ],
      );
      expect(state.coOwnerPhoneInvalid(0), isFalse);
      expect(state.coOwnerPhoneInvalid(1), isTrue);
      expect(state.coOwnerPhoneInvalid(5), isFalse);
    });
  });
}
