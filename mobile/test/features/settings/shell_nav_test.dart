import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:kaundia_app/core/auth/auth_repository.dart';
import 'package:kaundia_app/core/auth/session.dart';
import 'package:kaundia_app/core/di/injector.dart';
import 'package:kaundia_app/core/feature_flags/feature_flags_repository.dart';
import 'package:kaundia_app/core/feature_flags/feature_flags_service.dart';
import 'package:kaundia_app/core/helpline/helpline_repository.dart';
import 'package:kaundia_app/core/network/api_client.dart';
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

class _MockApi extends Mock implements ApiClient {}

class _FlagsRepo implements FeatureFlagsRepository {
  _FlagsRepo(this.flags);
  final Map<String, bool> flags;
  @override
  Future<Map<String, bool>> fetch() async => flags;
}

class _FakeHelpline extends HelplineRepository {
  _FakeHelpline(this.value) : super(apiClient: _MockApi());
  final Helpline value;
  @override
  Future<Helpline> load() async => value;
}

const _memberPerms = {'profile.view_own', 'neighbour.view', 'boundary.view'};

void main() {
  final bn = AppLocalizationsBn();

  Future<void> setup(
    WidgetTester tester, {
    Map<String, bool> flags = const {},
    Helpline helpline = Helpline.empty,
    String initial = '/dashboard',
    double width = 400,
  }) async {
    await sl.reset();
    final prefs = _MockPrefs();
    when(() => prefs.themeMode).thenReturn('system');
    when(() => prefs.language).thenReturn('bn');
    when(() => prefs.setThemeMode(any())).thenAnswer((_) async {});
    when(() => prefs.setLanguage(any())).thenAnswer((_) async {});
    sl.registerSingleton<AppPreferences>(prefs);
    final session = SessionManager()..set(const Session(accessToken: 't', role: 'member', permissions: _memberPerms));
    sl.registerSingleton<SessionManager>(session);
    final service = FeatureFlagsService(_FlagsRepo(flags));
    await service.load();
    sl.registerSingleton<FeatureFlagsService>(service);
    sl.registerSingleton<HelplineRepository>(_FakeHelpline(helpline));
    addTearDown(sl.reset);

    useTallViewport(tester, width: width, height: 900);
    Widget page(String name) => Center(child: Text('page:$name'));
    final router = GoRouter(
      initialLocation: initial,
      routes: [
        ShellRoute(
          builder: (_, __, child) => ShellPage(child: child),
          routes: [
            for (final p in [
              '/dashboard', '/installments', '/payments', '/my-land', '/organisation', '/profile',
              '/neighbours', '/plot-map', '/notices', '/cost-shares',
            ])
              GoRoute(path: p, builder: (_, __) => page(p)),
          ],
        ),
      ],
    );
    await tester.pumpWidget(MultiBlocProvider(
      providers: [
        BlocProvider(create: (_) => SettingsBloc()),
        BlocProvider<AuthBloc>(create: (_) => AuthBloc(repository: _MockAuthRepo())),
      ],
      child: MaterialApp.router(
        routerConfig: router,
        locale: const Locale('bn'),
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: AppLocalizations.supportedLocales,
      ),
    ));
    await tester.pumpAndSettle();
  }

  NavigationBar bar(WidgetTester tester) => tester.widget<NavigationBar>(find.byType(NavigationBar));

  group('flags off: unchanged member shell', () {
    testWidgets('old destinations, theme toggle in the app bar, no five areas, no help button', (tester) async {
      await setup(tester, helpline: const Helpline(phone: '+8801712345678', enabled: true));

      final labels = bar(tester).destinations.length;
      expect(labels, 5, reason: '4 primary routes plus More, as before');
      expect(find.text(bn.navAreaLand), findsNothing);
      expect(find.byIcon(Icons.brightness_auto_outlined), findsOneWidget);
      expect(find.byKey(const Key('helpFab')), findsNothing);
      expect(find.text('English'), findsNothing);
    });
  });

  group('nav_five_areas on', () {
    testWidgets('bottom bar has the five areas with labels', (tester) async {
      await setup(tester, flags: {'nav_five_areas': true});

      final d = bar(tester).destinations.cast<NavigationDestination>();
      expect(d.map((e) => e.label), [
        bn.navAreaHome,
        bn.navAreaPayments,
        bn.navAreaLand,
        bn.navAreaOrganisation,
        bn.navAreaProfile,
      ]);
      expect(bar(tester).selectedIndex, 0);
    });

    testWidgets('a sub-page highlights its parent area', (tester) async {
      await setup(tester, flags: {'nav_five_areas': true}, initial: '/neighbours');
      expect(bar(tester).selectedIndex, 2);
    });

    testWidgets('payments tab goes to /installments, or /payments with pay_merged_page', (tester) async {
      await setup(tester, flags: {'nav_five_areas': true});
      await tester.tap(find.text(bn.navAreaPayments).last);
      await tester.pumpAndSettle();
      expect(find.text('page:/installments'), findsOneWidget);

      await setup(tester, flags: {'nav_five_areas': true, 'pay_merged_page': true});
      await tester.tap(find.text(bn.navAreaPayments).last);
      await tester.pumpAndSettle();
      expect(find.text('page:/payments'), findsOneWidget);
    });

    testWidgets('language switch replaces the language icon; theme toggle leaves the app bar', (tester) async {
      await setup(tester, flags: {'nav_five_areas': true});

      expect(find.text('বাংলা'), findsOneWidget);
      expect(find.text('English'), findsOneWidget);
      expect(find.byIcon(Icons.brightness_auto_outlined), findsNothing);
      expect(find.byIcon(Icons.translate), findsNothing);

      await tester.tap(find.text('English'));
      await tester.pumpAndSettle();
      verify(() => sl<AppPreferences>().setLanguage('en')).called(1);
    });

    testWidgets('wide layouts list the five areas in the side panel', (tester) async {
      await setup(tester, flags: {'nav_five_areas': true}, width: 1200);
      expect(find.text(bn.navAreaLand), findsOneWidget);
      expect(find.text(bn.navAreaOrganisation), findsOneWidget);
    });
  });

  group('nav_merged_entries: help button', () {
    const open = Helpline(phone: '+8801712345678', whatsapp: '+8801812345678', enabled: true);

    testWidgets('shown when the flag is on and a helpline is set', (tester) async {
      await setup(tester, flags: {'nav_merged_entries': true}, helpline: open);
      expect(find.byKey(const Key('helpFab')), findsOneWidget);
      expect(find.text(bn.helpFab), findsOneWidget);
    });

    testWidgets('hidden while the helpline is empty', (tester) async {
      await setup(tester, flags: {'nav_merged_entries': true}, helpline: Helpline.empty);
      expect(find.byKey(const Key('helpFab')), findsNothing);
    });

    testWidgets('hidden when the flag is off even if a helpline exists', (tester) async {
      await setup(tester, helpline: open);
      expect(find.byKey(const Key('helpFab')), findsNothing);
    });

    testWidgets('sheet offers call and WhatsApp only for the numbers that are set', (tester) async {
      await setup(tester,
          flags: {'nav_merged_entries': true}, helpline: const Helpline(phone: '+8801712345678', enabled: true));
      await tester.tap(find.byKey(const Key('helpFab')));
      await tester.pumpAndSettle();
      expect(find.text(bn.helpCall), findsOneWidget);
      expect(find.text(bn.helpWhatsapp), findsNothing);
    });
  });
}
