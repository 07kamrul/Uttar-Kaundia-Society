import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/core/enums/enums.dart';
import 'package:kaundia_app/core/navigation/nav_items.dart';
import 'package:kaundia_app/core/router/guards.dart';
import 'package:kaundia_app/l10n/app_localizations_bn.dart';

/// Route -> the Angular permissionGuard list for that route.
const _guards = {
  '/committee-registry': ['committee_registry.manage'],
  '/fund-controls': ['fund.manage', 'signatory.manage', 'audit_report.manage', 'welfare_fund.review'],
  '/asset-register': ['asset_register.manage'],
  '/welfare-activities': ['welfare_activity.manage'],
};

List<String> _menuRoutes(bool Function(String) can, {bool console = false}) => [
      for (final g in AppNav.adminGroups(landingTier: LandingTier.management, can: can, adminConsole: console))
        for (final i in g.items) i.route,
    ];

void main() {
  test('route guards match the Angular permissionGuard lists', () {
    _guards.forEach((route, perms) {
      expect(requiredPermissionFor(route), perms, reason: route);
    });
  });

  test('each page shows in the admin menu only with its permission', () {
    _guards.forEach((route, perms) {
      for (final p in perms) {
        expect(_menuRoutes((x) => x == p), contains(route), reason: '$route via $p');
        expect(_menuRoutes((x) => x == p, console: true), contains(route), reason: '$route via $p (console)');
      }
      expect(_menuRoutes((x) => x == 'manage_finance'), isNot(contains(route)), reason: route);
    });
  });

  test('fund controls sits in the money group, the registers in organisation', () {
    final groups = AppNav.adminGroups(landingTier: LandingTier.management, can: (_) => true);
    final bn = AppLocalizationsBn();
    final money = groups.firstWhere((g) => g.labelKey(bn) == bn.adminGroupMoney);
    final org = groups.firstWhere((g) => g.labelKey(bn) == bn.adminGroupOrganisation);
    expect(money.items.map((i) => i.route), contains('/fund-controls'));
    expect(org.items.map((i) => i.route), containsAll(['/committee-registry', '/welfare-activities', '/asset-register']));
    expect(org.items.firstWhere((i) => i.route == '/asset-register').labelKey(bn), 'সম্পদ রেজিস্টার');
  });

  test('members get no register entries', () {
    expect(AppNav.adminGroups(landingTier: LandingTier.member, can: (_) => true), isEmpty);
  });
}
