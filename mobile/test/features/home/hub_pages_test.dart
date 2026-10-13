import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:kaundia_app/features/home/my_land_hub_page.dart';
import 'package:kaundia_app/features/home/organisation_hub_page.dart';
import 'package:kaundia_app/l10n/app_localizations.dart';
import 'package:kaundia_app/l10n/app_localizations_bn.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import '../../support/pump_app.dart';

Future<void> _pump(WidgetTester tester, Widget page) async {
  useTallViewport(tester);
  final router = GoRouter(routes: [
    GoRoute(path: '/', builder: (_, __) => Scaffold(body: page)),
    GoRoute(path: '/neighbours', builder: (_, __) => const Text('neighbours-page')),
    GoRoute(path: '/notices', builder: (_, __) => const Text('notices-page')),
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
}

void main() {
  final bn = AppLocalizationsBn();

  testWidgets('my land hub shows only the tiles the member may open and navigates', (tester) async {
    await _pump(tester, MyLandHubPage(can: (p) => p == 'neighbour.view'));
    expect(find.text(bn.navAreaLand), findsOneWidget);
    expect(find.byKey(const Key('hubTile_/neighbours')), findsOneWidget);
    expect(find.byKey(const Key('hubTile_/plot-map')), findsNothing);
    expect(find.byKey(const Key('hubTile_/property-requests/new')), findsNothing);

    await tester.tap(find.byKey(const Key('hubTile_/neighbours')));
    await tester.pumpAndSettle();
    expect(find.text('neighbours-page'), findsOneWidget);
  });

  testWidgets('organisation hub lists the content pages for everyone', (tester) async {
    await _pump(tester, OrganisationHubPage(can: (_) => false));
    for (final r in ['/notices', '/events', '/resolution-book', '/fund-transparency', '/roadmap']) {
      expect(find.byKey(Key('hubTile_$r')), findsOneWidget, reason: r);
    }
    await tester.tap(find.byKey(const Key('hubTile_/notices')));
    await tester.pumpAndSettle();
    expect(find.text('notices-page'), findsOneWidget);
  });
}
