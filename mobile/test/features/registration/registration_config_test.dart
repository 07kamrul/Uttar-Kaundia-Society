import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/features/registration/data/registration_config_repository.dart';

void main() {
  test('parses consent version and accounts; null number/account_name are blank', () {
    final c = RegistrationConfig.fromJson({
      'consent_version': '2026-10',
      'payment_accounts': [
        {'method': 'bkash', 'label': 'bKash 01711111111 (Personal)', 'number': '01711111111', 'account_name': null},
        {'method': 'bank', 'label': 'Some Bank, Savar branch', 'number': null, 'account_name': null},
      ],
    });
    expect(c.consentVersion, '2026-10');
    expect(c.paymentAccounts, hasLength(2));
    expect(c.accountsFor('bkash').single.number, '01711111111');
    expect(c.accountsFor('bank').single.number, isEmpty);
    expect(c.accountsFor('bank').single.label, 'Some Bank, Savar branch');
  });

  test('malformed body yields the empty config', () {
    expect(RegistrationConfig.fromJson('nope').paymentAccounts, isEmpty);
  });
}
