import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/core/auth/session.dart';
import 'package:kaundia_app/core/enums/enums.dart';
import 'package:kaundia_app/core/feature_flags/feature_flags_repository.dart';
import 'package:kaundia_app/core/feature_flags/feature_flags_service.dart';
import 'package:kaundia_app/core/navigation/nav_items.dart';

class _Repo implements FeatureFlagsRepository {
  _Repo(this.flags);
  final Map<String, bool> flags;
  @override
  Future<Map<String, bool>> fetch() async => flags;
}

Future<FeatureFlagsService> _flags(Map<String, bool> f) async {
  final s = FeatureFlagsService(_Repo(f));
  await s.load();
  return s;
}

bool _all(String _) => true;

void main() {
  group('memberAreas', () {
    test('returns the five areas in order, payments to /installments when merged page is off', () async {
      final areas = AppNav.memberAreas(await _flags({'nav_five_areas': true}), can: _all);
      expect(areas.map((a) => a.route), ['/dashboard', '/installments', '/my-land', '/organisation', '/profile']);
      expect(areas.map((a) => a.area), NavArea.values);
    });

    test('payments tab points to /payments when pay_merged_page is on', () async {
      final areas = AppNav.memberAreas(await _flags({'pay_merged_page': true}), can: _all);
      expect(areas[1].route, '/payments');
    });

    test('permission filtering drops areas the member cannot open', () async {
      final areas = AppNav.memberAreas(await _flags({}), can: (p) => false);
      expect(areas.map((a) => a.area), [NavArea.home, NavArea.organisation]);
    });
  });

  group('areaForRoute', () {
    test('sub-pages map to their parent area', () {
      expect(AppNav.areaForRoute('/dashboard'), NavArea.home);
      expect(AppNav.areaForRoute('/installments'), NavArea.payments);
      expect(AppNav.areaForRoute('/cost-shares'), NavArea.payments);
      expect(AppNav.areaForRoute('/payments'), NavArea.payments);
      expect(AppNav.areaForRoute('/picnic-payment'), NavArea.payments);
      expect(AppNav.areaForRoute('/neighbours'), NavArea.land);
      expect(AppNav.areaForRoute('/plot-map/draw'), NavArea.land);
      expect(AppNav.areaForRoute('/property-requests/new'), NavArea.land);
      expect(AppNav.areaForRoute('/notices/12'), NavArea.organisation);
      expect(AppNav.areaForRoute('/resolution-book/meeting/3'), NavArea.organisation);
      expect(AppNav.areaForRoute('/change-password'), NavArea.profile);
      expect(AppNav.areaForRoute('/members'), isNull);
    });
  });

  group('hubs', () {
    test('every member route of the old menu is reachable from an area or a hub', () {
      final old = AppNav.items
          .where((i) => i.tier == LandingTierFilter.member || (i.requiredPermission == null && i.area != null))
          .map((i) => i.route)
          .where((r) => r != '/payments' && r != '/dashboard')
          .toSet();
      final reachable = <String>{
        ...AppNav.memberAreas(FeatureFlagsService(_Repo(const {})), can: _all).map((a) => a.route),
        for (final a in [NavArea.land, NavArea.organisation]) ...AppNav.hubItems(a, can: _all).map((i) => i.route),
        '/cost-shares', // inside the payments page
      };
      expect(old.difference(reachable), isEmpty);
    });

    test('hub tiles follow the old permission rules', () {
      final land = AppNav.hubItems(NavArea.land, can: (p) => p == AppPermissions.neighbourView);
      expect(land.map((i) => i.route), ['/neighbours']);
      final none = AppNav.hubItems(NavArea.land, can: (_) => false);
      expect(none, isEmpty);
      final org = AppNav.hubItems(NavArea.organisation, can: (_) => false);
      expect(
        org.map((i) => i.route),
        containsAll(['/notices', '/events', '/resolution-book', '/fund-transparency', '/roadmap']),
      );
    });
  });

  group('visibleFor with merged payments', () {
    List<String> routes(bool merged) => AppNav.visibleFor(
          landingTier: LandingTier.member,
          can: _all,
          mergedPayments: merged,
        ).map((i) => i.route).toList();

    test('flag off: unchanged, installments and cost shares separate, no /payments', () {
      final r = routes(false);
      expect(r, containsAll(['/installments', '/cost-shares']));
      expect(r, isNot(contains('/payments')));
    });

    test('flag on: one payments entry replaces installments and cost shares', () {
      final r = routes(true);
      expect(r, contains('/payments'));
      expect(r, isNot(contains('/installments')));
      expect(r, isNot(contains('/cost-shares')));
    });

    test('default argument keeps the old menu', () {
      final r = AppNav.visibleFor(landingTier: LandingTier.member, can: _all).map((i) => i.route);
      expect(r, contains('/installments'));
    });
  });
}
