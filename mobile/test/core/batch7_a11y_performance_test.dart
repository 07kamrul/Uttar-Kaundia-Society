import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/core/accessibility/display_prefs.dart';
import 'package:kaundia_app/core/accessibility/text_scale.dart';
import 'package:kaundia_app/core/data_saver/data_saver.dart';
import 'package:kaundia_app/core/di/injector.dart';
import 'package:kaundia_app/core/feature_flags/feature_flags_repository.dart';
import 'package:kaundia_app/core/feature_flags/feature_flags_service.dart';
import 'package:kaundia_app/core/network/api_client.dart';
import 'package:kaundia_app/core/network/network_status.dart';
import 'package:kaundia_app/core/storage/app_preferences.dart';
import 'package:kaundia_app/features/management/presentation/widgets/management_widgets.dart' show confirmDialog;
import 'package:kaundia_app/features/plot_boundary/presentation/widgets/draw_panel_sheet.dart' show confirmAction;
import 'package:kaundia_app/features/registration/presentation/widgets/step_help_button.dart';
import 'package:kaundia_app/core/theme/app_theme.dart';
import 'package:kaundia_app/features/member/presentation/widgets/display_settings_card.dart';
import 'package:kaundia_app/features/settings/settings_bloc.dart';
import 'package:kaundia_app/l10n/app_localizations.dart';
import 'package:kaundia_app/l10n/app_localizations_bn.dart';
import 'package:kaundia_app/shared/widgets/net_status_banner.dart';
import 'package:kaundia_app/shared/widgets/plain_confirm.dart';
import 'package:kaundia_app/shared/widgets/tap_to_load_image.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../support/pump_app.dart';

class _MockPrefs extends Mock implements AppPreferences {}

class _FlagsRepo implements FeatureFlagsRepository {
  _FlagsRepo(this.flags);
  final Map<String, bool> flags;
  @override
  Future<Map<String, bool>> fetch() async => flags;
}

/// Answers every request with a fixed outcome after [delay].
class _Adapter implements HttpClientAdapter {
  _Adapter(this.outcome, {this.delay = Duration.zero});
  final Object outcome; // ResponseBody or DioException type
  final Duration delay;

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<List<int>>? body, Future<void>? cancel) async {
    await Future<void>.delayed(delay);
    final o = outcome;
    if (o is DioExceptionType) throw DioException(requestOptions: options, type: o);
    return o as ResponseBody;
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _json(int status) => ResponseBody.fromString('{"ok":true}', status, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    });

Future<void> _registerFlags(Map<String, bool> flags) async {
  final s = FeatureFlagsService(_FlagsRepo(flags));
  await s.load();
  sl.registerSingleton<FeatureFlagsService>(s);
}

void main() {
  final bn = AppLocalizationsBn();

  group('AppPreferences', () {
    test('text scale and data saver default to off and persist', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = AppPreferences(await SharedPreferences.getInstance());
      expect(prefs.textScale, 1.0);
      expect(prefs.dataSaver, isFalse);
      expect(prefs.mapTourDone, isFalse);

      await prefs.setTextScale(1.15);
      await prefs.setDataSaver(true);
      await prefs.setMapTourDone(true);
      final again = AppPreferences(await SharedPreferences.getInstance());
      expect(again.textScale, 1.15);
      expect(again.dataSaver, isTrue);
      expect(again.mapTourDone, isTrue);
    });

    test('only the two supported text scales are accepted', () async {
      SharedPreferences.setMockInitialValues({'krmf_text_size': 3.0});
      final prefs = AppPreferences(await SharedPreferences.getInstance());
      expect(prefs.textScale, 1.0);
    });
  });

  group('text scale', () {
    test('multiplies the system setting and never exceeds 1.3', () {
      expect(effectiveTextScaler(TextScaler.noScaling, pref: 1.0).scale(10), 10);
      expect(effectiveTextScaler(TextScaler.noScaling, pref: 1.15).scale(10), closeTo(11.5, 1e-9));
      expect(effectiveTextScaler(const TextScaler.linear(1.2), pref: 1.15).scale(10), closeTo(13, 1e-9));
      expect(effectiveTextScaler(const TextScaler.linear(2.0), pref: 1.0).scale(10), closeTo(13, 1e-9));
    });

    test('a smaller system setting is respected', () {
      expect(effectiveTextScaler(const TextScaler.linear(0.9), pref: 1.0).scale(10), closeTo(9, 1e-9));
    });

    testWidgets('the builder applies it to the whole app', (tester) async {
      late TextScaler seen;
      await tester.pumpWidget(MaterialApp(
        builder: (context, child) => a11yTextScaleBuilder(context, child, pref: 1.15),
        home: Builder(builder: (context) {
          seen = MediaQuery.textScalerOf(context);
          return const SizedBox();
        }),
      ));
      expect(seen.scale(10), closeTo(11.5, 1e-9));
    });
  });

  group('theme', () {
    test('no unbundled font names remain (the system font is used)', () {
      for (final t in [AppTheme.light(), AppTheme.dark(), AppTheme.light(a11yV2: true)]) {
        expect(t.textTheme.bodyMedium?.fontFamily, isNot('Inter'));
        expect(t.appBarTheme.titleTextStyle?.fontFamily, isNull);
      }
    });

    test('a11y v2: 48 px targets, 16 px body, 14 px minimum for the rest', () {
      final base = AppTheme.light();
      final v2 = AppTheme.light(a11yV2: true);
      expect(base.materialTapTargetSize, isNot(MaterialTapTargetSize.padded));
      expect(v2.materialTapTargetSize, MaterialTapTargetSize.padded);
      expect(v2.textTheme.bodyMedium!.fontSize, 16);
      expect(v2.textTheme.bodyLarge!.fontSize, greaterThanOrEqualTo(16));
      expect(v2.textTheme.bodySmall!.fontSize, greaterThanOrEqualTo(14));
      expect(v2.textTheme.labelMedium!.fontSize, greaterThanOrEqualTo(14));
      expect(v2.iconButtonTheme.style?.minimumSize?.resolve({}), const Size(48, 48));
      expect(base.textTheme.bodyMedium!.fontSize, 14, reason: 'flag off unchanged');
    });
  });

  group('NetworkStatusCubit', () {
    NetworkStatusCubit make() => NetworkStatusCubit(
        slowAfter: const Duration(milliseconds: 30), reconnectedFor: const Duration(milliseconds: 30));

    test('starts online; a network failure goes offline, then reconnected, then online', () async {
      final c = make();
      addTearDown(c.close);
      expect(c.state, NetStatus.online);

      c.requestStarted('a');
      c.requestFailed('a', offline: true);
      expect(c.state, NetStatus.offline);

      c.requestStarted('b');
      c.requestSucceeded('b');
      expect(c.state, NetStatus.reconnected);
      await Future<void>.delayed(const Duration(milliseconds: 60));
      expect(c.state, NetStatus.online);
    });

    test('a request slower than the limit shows slow, and its end clears it', () async {
      final c = make();
      addTearDown(c.close);
      c.requestStarted('a');
      await Future<void>.delayed(const Duration(milliseconds: 60));
      expect(c.state, NetStatus.slow);
      c.requestSucceeded('a');
      expect(c.state, NetStatus.online);
    });

    test('a fast request never shows slow', () async {
      final c = make();
      addTearDown(c.close);
      c.requestStarted('a');
      c.requestSucceeded('a');
      await Future<void>.delayed(const Duration(milliseconds: 60));
      expect(c.state, NetStatus.online);
    });

    test('an HTTP error answered by the server is not "offline"', () {
      final c = make();
      addTearDown(c.close);
      c.requestStarted('a');
      c.requestFailed('a', offline: false);
      expect(c.state, NetStatus.online);
    });
  });

  group('ApiClient feeds the network status', () {
    ApiClient client(HttpClientAdapter adapter, NetworkObserver observer) => ApiClient(
          tokenProvider: () async => null,
          onUnauthorized: () {},
          dio: Dio(BaseOptions(
            baseUrl: 'http://localhost/api',
            validateStatus: (s) => s != null && s >= 200 && s < 300,
          ))
            ..httpClientAdapter = adapter,
          networkObserver: observer,
        );

    test('connection errors mean offline, a later success means back', () async {
      final cubit = NetworkStatusCubit(reconnectedFor: const Duration(milliseconds: 20));
      addTearDown(cubit.close);
      await expectLater(
          client(_Adapter(DioExceptionType.connectionError), cubit).getUri('/x'), throwsA(anything));
      expect(cubit.state, NetStatus.offline);

      await client(_Adapter(_json(200)), cubit).getUri('/x');
      expect(cubit.state, NetStatus.reconnected);
    });

    test('a connection timeout is offline too; a 500 is not', () async {
      final cubit = NetworkStatusCubit();
      addTearDown(cubit.close);
      await expectLater(
          client(_Adapter(DioExceptionType.connectionTimeout), cubit).getUri('/x'), throwsA(anything));
      expect(cubit.state, NetStatus.offline);

      final other = NetworkStatusCubit();
      addTearDown(other.close);
      await expectLater(client(_Adapter(_json(500)), other).getUri('/x'), throwsA(anything));
      expect(other.state, NetStatus.online);
    });

    test('a request over the limit is reported slow while it runs', () async {
      final cubit = NetworkStatusCubit(slowAfter: const Duration(milliseconds: 20));
      addTearDown(cubit.close);
      final pending = client(_Adapter(_json(200), delay: const Duration(milliseconds: 80)), cubit).getUri('/x');
      await Future<void>.delayed(const Duration(milliseconds: 50));
      expect(cubit.state, NetStatus.slow);
      await pending;
      expect(cubit.state, NetStatus.online);
    });
  });

  group('NetStatusBanner', () {
    Future<NetworkStatusCubit> show(WidgetTester tester) async {
      final cubit = NetworkStatusCubit(reconnectedFor: const Duration(milliseconds: 500));
      addTearDown(cubit.close);
      await pumpBn(tester, NetStatusBanner(cubit: cubit));
      return cubit;
    }

    testWidgets('nothing while online', (tester) async {
      await show(tester);
      expect(find.text(bn.netOffline), findsNothing);
      expect(find.text(bn.netSlow), findsNothing);
    });

    testWidgets('says offline, slow and reconnected in plain words', (tester) async {
      final cubit = await show(tester);
      cubit.requestStarted('a');
      cubit.requestFailed('a', offline: true);
      await tester.pump();
      expect(find.text(bn.netOffline), findsOneWidget);

      cubit.requestStarted('b');
      cubit.requestSucceeded('b');
      await tester.pump();
      expect(find.text(bn.netReconnected), findsOneWidget);
      await tester.pump(const Duration(milliseconds: 600));
      expect(find.text(bn.netReconnected), findsNothing);
    });

    testWidgets('is a polite live region so screen readers announce it', (tester) async {
      final handle = tester.ensureSemantics();
      final cubit = await show(tester);
      cubit.requestStarted('a');
      cubit.requestFailed('a', offline: true);
      await tester.pump();
      expect(
        find.byWidgetPredicate((w) => w is Semantics && w.properties.liveRegion == true),
        findsOneWidget,
      );
      handle.dispose();
    });
  });

  group('showPlainConfirm', () {
    Future<void> open(WidgetTester tester, void Function(bool?) result) async {
      await pumpBn(
        tester,
        Builder(
          builder: (context) => TextButton(
            onPressed: () async => result(await showPlainConfirm(context,
                title: 'মুছে ফেলবেন?', consequence: 'এটি আর ফেরানো যাবে না।', action: 'মুছে ফেলুন')),
            child: const Text('open'),
          ),
        ),
      );
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
    }

    testWidgets('a question, one sentence, and yes / no buttons in plain words', (tester) async {
      await open(tester, (_) {});
      expect(find.text('মুছে ফেলবেন?'), findsOneWidget);
      expect(find.text('এটি আর ফেরানো যাবে না।'), findsOneWidget);
      expect(find.text('হ্যাঁ, মুছে ফেলুন'), findsOneWidget);
      expect(find.text('না, ফিরে যান'), findsOneWidget);
      expect(tester.getSize(find.widgetWithText(FilledButton, 'হ্যাঁ, মুছে ফেলুন')).height,
          greaterThanOrEqualTo(48));
    });

    testWidgets('returns true on yes and false on no', (tester) async {
      bool? answer;
      await open(tester, (r) => answer = r);
      await tester.tap(find.text('হ্যাঁ, মুছে ফেলুন'));
      await tester.pumpAndSettle();
      expect(answer, isTrue);

      await open(tester, (r) => answer = r);
      await tester.tap(find.text('না, ফিরে যান'));
      await tester.pumpAndSettle();
      expect(answer, isFalse);
    });
  });

  group('TapToLoadImage', () {
    testWidgets('data saver off: the image builds straight away', (tester) async {
      await pumpBn(tester, TapToLoadImage(dataSaver: false, builder: () => const Text('picture')));
      expect(find.text('picture'), findsOneWidget);
      expect(find.text(bn.tapToLoadImage), findsNothing);
    });

    testWidgets('data saver on: a labelled placeholder until it is tapped', (tester) async {
      await pumpBn(tester, TapToLoadImage(dataSaver: true, builder: () => const Text('picture')));
      expect(find.text('picture'), findsNothing);
      expect(find.text(bn.tapToLoadImage), findsOneWidget);
      await tester.tap(find.text(bn.tapToLoadImage));
      await tester.pump();
      expect(find.text('picture'), findsOneWidget);
    });
  });

  group('dataSaverActive', () {
    setUp(() async => sl.reset());
    tearDown(() async => sl.reset());

    test('needs both the flag and the member\'s own switch', () async {
      final prefs = _MockPrefs();
      when(() => prefs.dataSaver).thenReturn(true);
      sl.registerSingleton<AppPreferences>(prefs);
      expect(dataSaverActive(), isFalse, reason: 'flag not loaded');
      await _registerFlags({'data_saver': true});
      expect(dataSaverActive(), isTrue);
      when(() => prefs.dataSaver).thenReturn(false);
      expect(dataSaverActive(), isFalse);
    });

    test('with nothing registered it is off', () {
      expect(dataSaverActive(), isFalse);
    });
  });

  group('DisplaySettingsCard switches', () {
    late _MockPrefs prefs;

    Future<void> open(WidgetTester tester, Map<String, bool> flags) async {
      await sl.reset();
      prefs = _MockPrefs();
      when(() => prefs.themeMode).thenReturn('system');
      when(() => prefs.language).thenReturn('bn');
      when(() => prefs.textScale).thenReturn(1.0);
      when(() => prefs.dataSaver).thenReturn(false);
      when(() => prefs.setTextScale(any())).thenAnswer((_) async {});
      when(() => prefs.setDataSaver(any())).thenAnswer((_) async {});
      sl.registerSingleton<AppPreferences>(prefs);
      sl.registerSingleton<DisplayPrefs>(DisplayPrefs(prefs));
      await _registerFlags(flags);
      addTearDown(sl.reset);
      await pumpBn(tester,
          BlocProvider(create: (_) => SettingsBloc(), child: const DisplaySettingsCard()));
    }

    testWidgets('both flags off: only the theme row, as before', (tester) async {
      await open(tester, {});
      expect(find.byKey(const Key('themeToggle')), findsOneWidget);
      expect(find.byKey(const Key('textLargeSwitch')), findsNothing);
      expect(find.byKey(const Key('dataSaverSwitch')), findsNothing);
    });

    testWidgets('ui_a11y_v2: "লেখা বড় করুন" switch persists', (tester) async {
      await open(tester, {'ui_a11y_v2': true});
      expect(find.text(bn.settingsTextLarge), findsOneWidget);
      expect(find.byKey(const Key('dataSaverSwitch')), findsNothing);
      await tester.tap(find.byKey(const Key('textLargeSwitch')));
      await tester.pumpAndSettle();
      verify(() => prefs.setTextScale(1.15)).called(1);
      expect(sl<DisplayPrefs>().textScale, 1.15);
      expect(tester.widget<Switch>(find.byKey(const Key('textLargeSwitch'))).value, isTrue);
    });

    testWidgets('data_saver: "ডেটা সাশ্রয়" switch persists', (tester) async {
      await open(tester, {'data_saver': true});
      expect(find.text(bn.settingsDataSaver), findsOneWidget);
      await tester.tap(find.byKey(const Key('dataSaverSwitch')));
      await tester.pumpAndSettle();
      verify(() => prefs.setDataSaver(true)).called(1);
    });
  });

  group('a11y guidelines (ui_a11y_v2 theme)', () {
    testWidgets('settings card meets tap target and label guidelines', (tester) async {
      final handle = tester.ensureSemantics();
      await sl.reset();
      final prefs = _MockPrefs();
      when(() => prefs.themeMode).thenReturn('system');
      when(() => prefs.language).thenReturn('bn');
      when(() => prefs.textScale).thenReturn(1.0);
      when(() => prefs.dataSaver).thenReturn(false);
      sl.registerSingleton<AppPreferences>(prefs);
      sl.registerSingleton<DisplayPrefs>(DisplayPrefs(prefs));
      await _registerFlags({'ui_a11y_v2': true, 'data_saver': true});
      addTearDown(sl.reset);
      useTallViewport(tester);
      await tester.pumpWidget(MaterialApp(
        theme: AppTheme.light(a11yV2: true),
        locale: const Locale('bn'),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: BlocProvider(
            create: (_) => SettingsBloc(),
            child: const DisplaySettingsCard(),
          ),
        ),
      ));
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      handle.dispose();
    });
  });

  group('confirm dialogs follow ui_a11y_v2', () {
    Future<void> open(WidgetTester tester, {required bool on}) async {
      await sl.reset();
      await _registerFlags({'ui_a11y_v2': on});
      addTearDown(sl.reset);
      await pumpBn(
        tester,
        Builder(
          builder: (context) => Column(children: [
            TextButton(
              onPressed: () => confirmDialog(context, title: 'মুছবেন?', message: 'বার্তা', confirmLabel: 'মুছুন'),
              child: const Text('mgmt'),
            ),
            TextButton(
              onPressed: () => confirmAction(context, title: 'বাতিল?', message: 'বার্তা', confirmLabel: 'প্রত্যাহার'),
              child: const Text('plot'),
            ),
          ]),
        ),
      );
    }

    testWidgets('on: both ask in plain yes / no words', (tester) async {
      await open(tester, on: true);
      await tester.tap(find.text('mgmt'));
      await tester.pumpAndSettle();
      expect(find.text('হ্যাঁ, মুছুন'), findsOneWidget);
      expect(find.text('না, ফিরে যান'), findsOneWidget);
      await tester.tap(find.text('না, ফিরে যান'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('plot'));
      await tester.pumpAndSettle();
      expect(find.text('হ্যাঁ, প্রত্যাহার'), findsOneWidget);
    });

    testWidgets('off: the old buttons, unchanged', (tester) async {
      await open(tester, on: false);
      await tester.tap(find.text('mgmt'));
      await tester.pumpAndSettle();
      expect(find.text('মুছুন'), findsOneWidget);
      expect(find.text(bn.commonCancel), findsOneWidget);
      expect(find.text('না, ফিরে যান'), findsNothing);
    });
  });

  group('registration step help', () {
    Future<void> open(WidgetTester tester, int step) async {
      await pumpBn(tester, StepHelpButton(step: step));
      await tester.tap(find.byType(IconButton));
      await tester.pumpAndSettle();
    }

    testWidgets('a 48 px "?" opens two or three plain lines for the step', (tester) async {
      await pumpBn(tester, const StepHelpButton(step: 4));
      expect(tester.getSize(find.byType(IconButton)).height, greaterThanOrEqualTo(48));
      await tester.tap(find.byType(IconButton));
      await tester.pumpAndSettle();
      expect(find.text(bn.regHelpStep4), findsOneWidget);
    });

    testWidgets('each step has its own text', (tester) async {
      final texts = {
        1: bn.regHelpStep1,
        3: bn.regHelpStep3,
        5: bn.regHelpStep5,
        6: bn.regHelpStep6,
      };
      for (final e in texts.entries) {
        await open(tester, e.key);
        expect(find.text(e.value), findsOneWidget, reason: 'step ${e.key}');
        Navigator.of(tester.element(find.byType(StepHelpButton))).pop();
        await tester.pumpAndSettle();
      }
      expect(texts.values.toSet().length, texts.length);
    });

    testWidgets('step 2 reuses the plot-number help sheet', (tester) async {
      await open(tester, 2);
      expect(find.byType(BottomSheet), findsOneWidget);
    });
  });
}
