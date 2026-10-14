import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:kaundia_app/core/auth/auth_repository.dart';
import 'package:kaundia_app/core/auth/session.dart';
import 'package:kaundia_app/core/di/injector.dart';
import 'package:kaundia_app/core/enums/enums.dart';
import 'package:kaundia_app/core/feature_flags/feature_flags_repository.dart';
import 'package:kaundia_app/core/feature_flags/feature_flags_service.dart';
import 'package:kaundia_app/core/navigation/nav_items.dart';
import 'package:kaundia_app/core/storage/app_preferences.dart';
import 'package:kaundia_app/features/auth/bloc/auth_bloc.dart';
import 'package:kaundia_app/features/settings/settings_bloc.dart';
import 'package:kaundia_app/features/settings/shell_page.dart';
import 'package:kaundia_app/l10n/app_localizations.dart';
import 'package:kaundia_app/l10n/app_localizations_bn.dart';
import 'package:mocktail/mocktail.dart';

import '../../support/pump_app.dart';

class _MockPrefs extends Mock implements AppPreferences {}

class _MockAuthRepo extends Mock implements AuthRepository {}

class _FlagsRepo implements FeatureFlagsRepository {
  _FlagsRepo(this.flags);
  final Map<String, bool> flags;
  @override
  Future<Map<String, bool>> fetch() async => flags;
}

const _everything = {
  'membership.review', 'member.view_all', 'manage_finance', 'manage_fee_settings',
  'manage_costs', 'manage_system_config', 'manage_notices', 'manage_roles',
  'view_audit_log', 'property.review',
};

void main() {
  final bn = AppLocalizationsBn();

  group('AppNav.adminGroups (menu guard)', () {
    final groups = AppNav.adminGroups(
      landingTier: LandingTier.superAdmin,
      can: _everything.contains,
    );

    test('every admin route in the flat menu appears in exactly one group', () {
      final flat = AppNav.visibleFor(
        landingTier: LandingTier.superAdmin,
        can: _everything.contains,
      ).where((i) => i.area == null).map((i) => i.route).toList();
      final grouped = [for (final g in groups) for (final i in g.items) i.route];

      for (final route in flat) {
        expect(grouped.where((r) => r == route), hasLength(1), reason: route);
      }
      expect(grouped.toSet().length, grouped.length, reason: 'no duplicates');
    });

    test('there are four groups plus Advanced, in the contract order', () {
      expect(groups.map((g) => g.advanced), [false, false, false, false, true]);
      expect(groups.map((g) => g.labelKey(bn)).take(4), [
        bn.adminGroupApplications,
        bn.adminGroupMoney,
        bn.adminGroupOrganisation,
        bn.adminGroupSettings,
      ]);
    });

    test('the contract placement holds for the pages Flutter has', () {
      List<String> routes(int g) => groups[g].items.map((i) => i.route).toList();
      expect(routes(0), containsAll(['/submissions', '/members', '/property-requests']));
      expect(routes(1), containsAll(
          ['/payment-verifications', '/installments-management', '/society-costs', '/finance-management']));
      expect(routes(2), containsAll(['/notices-management', '/events-management']));
      expect(routes(3), contains('/fee-settings'));
      expect(routes(4), containsAll(['/config-lists', '/roles', '/audit-log']));
    });

    test('permissions still filter, and empty groups disappear', () {
      final finance = AppNav.adminGroups(
        landingTier: LandingTier.management,
        can: {'manage_finance'}.contains,
      );
      final routes = [for (final g in finance) for (final i in g.items) i.route];
      expect(routes, containsAll(['/installments-management', '/payment-verifications', '/finance-management']));
      expect(routes, isNot(contains('/members')));
      expect(finance.every((g) => g.items.isNotEmpty), isTrue);
    });

    test('members get no admin groups', () {
      expect(
        AppNav.adminGroups(landingTier: LandingTier.member, can: _everything.contains),
        isEmpty,
      );
    });
  });

  group('shell drawer', () {
    Future<void> setup(WidgetTester tester, {required bool groupsOn}) async {
      await sl.reset();
      final prefs = _MockPrefs();
      when(() => prefs.themeMode).thenReturn('system');
      when(() => prefs.language).thenReturn('bn');
      sl.registerSingleton<AppPreferences>(prefs);
      sl.registerSingleton<SessionManager>(SessionManager()
        ..set(const Session(accessToken: 't', role: 'admin', permissions: _everything)));
      final flags = FeatureFlagsService(_FlagsRepo({'nav_advanced_section': groupsOn}));
      await flags.load();
      sl.registerSingleton<FeatureFlagsService>(flags);
      addTearDown(sl.reset);

      useTallViewport(tester, width: 400, height: 1400);
      final router = GoRouter(initialLocation: '/dashboard', routes: [
        ShellRoute(
          builder: (_, __, child) => ShellPage(child: child),
          routes: [
            for (final p in ['/dashboard', '/members', '/submissions'])
              GoRoute(path: p, builder: (_, __) => Center(child: Text('page:$p'))),
          ],
        ),
      ]);
      await tester.pumpWidget(MultiBlocProvider(
        providers: [
          BlocProvider(create: (_) => SettingsBloc()),
          BlocProvider<AuthBloc>(create: (_) => AuthBloc(repository: _MockAuthRepo())),
        ],
        child: MaterialApp.router(
          routerConfig: router,
          locale: const Locale('bn'),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
        ),
      ));
      await tester.pumpAndSettle();
      final scaffold = tester.firstState<ScaffoldState>(find.byType(Scaffold));
      scaffold.openDrawer();
      await tester.pumpAndSettle();
    }

    testWidgets('flag off: the flat list, no group headings', (tester) async {
      await setup(tester, groupsOn: false);
      expect(find.text(bn.navMembersList), findsOneWidget);
      expect(find.text(bn.adminGroupApplications), findsNothing);
      expect(find.text(bn.adminGroupMoney), findsNothing);
    });

    testWidgets('flag on: group headings and the moved items', (tester) async {
      await setup(tester, groupsOn: true);
      for (final h in [bn.adminGroupApplications, bn.adminGroupMoney, bn.adminGroupOrganisation]) {
        expect(find.text(h), findsOneWidget, reason: h);
      }
      expect(find.text(bn.navMembersList), findsOneWidget);
      expect(find.text(bn.navPaymentVerifications), findsOneWidget);
    });
  });
}
