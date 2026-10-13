import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/core/router/guards.dart';

void main() {
  group('payment ledger routes are finance-gated', () {
    for (final route in ['/installments-management', '/picnic-payments']) {
      test('$route requires manage_finance', () {
        expect(requiredPermissionFor(route), ['manage_finance']);
      });
    }

    test('member directory stays on member.view_all', () {
      expect(requiredPermissionFor('/members/12'), ['member.view_all']);
    });
  });

  group('merged payments redirect (pay_merged_page on)', () {
    test('old payment routes go to /payments with the kind', () {
      expect(mergedPaymentsRedirect('/installments'), '/payments?kind=installment');
      expect(mergedPaymentsRedirect('/cost-shares'), '/payments?kind=cost_share');
      expect(mergedPaymentsRedirect('/picnic-payment'), '/payments?kind=other_fee&fee=picnic');
    });

    test('other routes are untouched', () {
      expect(mergedPaymentsRedirect('/payments?kind=installment'), isNull);
      expect(mergedPaymentsRedirect('/installments-management'), isNull);
      expect(mergedPaymentsRedirect('/dashboard'), isNull);
    });
  });

  group('new member hubs', () {
    test('/payments and /my-land need the member permission', () {
      expect(requiredPermissionFor('/payments?kind=installment'), ['profile.view_own']);
      expect(requiredPermissionFor('/my-land'), ['profile.view_own']);
    });
  });
}
