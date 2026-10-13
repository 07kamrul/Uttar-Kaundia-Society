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
}
