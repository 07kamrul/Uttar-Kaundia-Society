import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/core/auth/session.dart';
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

  group('other fees routing', () {
    Session session(String role, [Set<String> perms = const {}]) =>
        Session(accessToken: 't', role: role, permissions: perms);

    test('merged redirect keeps the preselected type', () {
      expect(mergedPaymentsRedirect('/other-fees'), '/payments?kind=other_fee');
      expect(mergedPaymentsRedirect('/other-fees?type=picnic'), '/payments?kind=other_fee&fee=picnic');
    });

    test('members may open /other-fees', () {
      expect(memberPaymentRoleRedirect(session('member'), '/other-fees?type=picnic'), isNull);
    });

    test('fee managers go to fee settings, other roles to the dashboard', () {
      expect(memberPaymentRoleRedirect(session('treasurer', {'manage_fee_settings'}), '/other-fees'),
          '/fee-settings');
      expect(memberPaymentRoleRedirect(session('secretary'), '/other-fees'), '/dashboard');
    });

    test('other routes are not role-gated', () {
      expect(memberPaymentRoleRedirect(session('secretary'), '/payments'), isNull);
    });
  });
}
