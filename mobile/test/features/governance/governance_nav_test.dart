import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:kaundia_app/core/enums/enums.dart';
import 'package:kaundia_app/core/navigation/nav_items.dart';
import 'package:kaundia_app/core/router/app_router.dart';
import 'package:kaundia_app/core/router/guards.dart';
import 'package:kaundia_app/features/home/organisation_hub_page.dart';
import 'package:kaundia_app/l10n/app_localizations.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import '../../support/pump_app.dart';

const _newRoutes = [
  '/elections',
  '/welfare-fund',
  '/complaints',
  '/complaints/land-protection',
  '/service-standard',
  '/emergency-help',
  '/petitions',
  '/amendments',
];

bool _all(String _) => true;

void main() {
  group('hub mapping (nav_five_areas on)', () {
    test('every new route is a tile of the organisation hub', () {
      final routes = AppNav.hubItems(NavArea.organisation, can: _all).map((i) => i.route);
      expect(routes, containsAll(_newRoutes));
    });

    test('every new route belongs to the organisation area', () {
      for (final r in _newRoutes) {
        expect(AppNav.areaForRoute(r), NavArea.organisation, reason: r);
      }
    });

    test('tiles use the same permissions as Angular', () {
      List<String> tiles(bool Function(String) can) =>
          AppNav.hubItems(NavArea.organisation, can: can).map((i) => i.route).toList();

      expect(tiles((p) => p == 'election.vote'), contains('/elections'));
      expect(tiles((p) => p == 'election.candidate'), contains('/elections'));
      expect(tiles((p) => p == 'welfare_fund.apply'), contains('/welfare-fund'));
      expect(tiles((p) => p == 'petition.create'), contains('/petitions'));
      expect(tiles((p) => p == 'land_complaint.create'), contains('/complaints/land-protection'));
      expect(tiles((p) => p == 'service_standard.view'), containsAll(['/service-standard', '/amendments']));
      expect(tiles((p) => p == 'amendment.propose'), contains('/amendments'));
      expect(tiles((p) => p == 'profile.view_own'), contains('/complaints'));

      final none = tiles((_) => false);
      for (final r in ['/elections', '/welfare-fund', '/petitions', '/amendments', '/service-standard', '/complaints']) {
        expect(none, isNot(contains(r)), reason: r);
      }
      // Help desk is open to every signed-in account.
      expect(none, contains('/emergency-help'));
    });
  });

  test('the real router has a route for every new hub tile', () {
    final paths = <String>{};
    void walk(List<RouteBase> routes, String prefix) {
      for (final r in routes) {
        if (r is GoRoute) {
          final full = r.path.startsWith('/') ? r.path : '$prefix/${r.path}';
          paths.add(full);
          walk(r.routes, full);
        } else {
          walk(r.routes, prefix);
        }
      }
    }

    walk(buildRouter().configuration.routes, '');
    expect(paths, containsAll(_newRoutes));
  });

  group('route guards', () {
    test('new routes need the Angular permissions', () {
      expect(requiredPermissionFor('/elections'), ['election.vote', 'election.candidate']);
      expect(requiredPermissionFor('/petitions'), ['petition.create']);
      expect(requiredPermissionFor('/welfare-fund'), ['welfare_fund.apply']);
      expect(requiredPermissionFor('/amendments'), ['amendment.propose', 'service_standard.view']);
      expect(requiredPermissionFor('/service-standard'), ['service_standard.view']);
      expect(requiredPermissionFor('/complaints/land-protection'), ['land_complaint.create']);
    });

    test('complaints and help desk stay open to any signed-in account', () {
      expect(requiredPermissionFor('/complaints'), isNull);
      expect(requiredPermissionFor('/emergency-help'), isNull);
    });
  });

  group('nav_five_areas off', () {
    test('the old member menu does not gain the new routes', () {
      final routes = AppNav.visibleFor(landingTier: LandingTier.member, can: _all).map((i) => i.route);
      for (final r in _newRoutes) {
        expect(routes, isNot(contains(r)), reason: r);
      }
    });
  });

  testWidgets('organisation hub tile opens the new page', (tester) async {
    useTallViewport(tester);
    final router = GoRouter(routes: [
      GoRoute(path: '/', builder: (_, __) => Scaffold(body: OrganisationHubPage(can: _all))),
      for (final r in _newRoutes) GoRoute(path: r, builder: (_, __) => Text('page:$r')),
    ]);
    await tester.pumpWidget(MaterialApp.router(
      routerConfig: router,
      locale: const Locale('bn'),
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: AppLocalizations.supportedLocales,
    ));
    await tester.pumpAndSettle();
    for (final r in _newRoutes) {
      final tile = find.byKey(Key('hubTile_$r'));
      await tester.ensureVisible(tile);
      expect(tile, findsOneWidget, reason: r);
    }
    final tile = find.byKey(const Key('hubTile_/elections'));
    await tester.tap(tile);
    await tester.pumpAndSettle();
    expect(find.text('page:/elections'), findsOneWidget);
  });
}
