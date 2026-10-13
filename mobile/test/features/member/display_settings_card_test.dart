import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/core/di/injector.dart';
import 'package:kaundia_app/core/storage/app_preferences.dart';
import 'package:kaundia_app/features/member/presentation/widgets/display_settings_card.dart';
import 'package:kaundia_app/features/settings/settings_bloc.dart';
import 'package:kaundia_app/l10n/app_localizations_bn.dart';
import 'package:mocktail/mocktail.dart';

import '../../support/pump_app.dart';

class _MockPrefs extends Mock implements AppPreferences {}

void main() {
  final bn = AppLocalizationsBn();

  testWidgets('theme toggle lives in the profile display card and cycles the mode', (tester) async {
    await sl.reset();
    final prefs = _MockPrefs();
    when(() => prefs.themeMode).thenReturn('system');
    when(() => prefs.language).thenReturn('bn');
    when(() => prefs.setThemeMode(any())).thenAnswer((_) async {});
    sl.registerSingleton<AppPreferences>(prefs);
    addTearDown(sl.reset);

    await pumpBn(tester, BlocProvider(create: (_) => SettingsBloc(), child: const DisplaySettingsCard()));

    expect(find.text(bn.profileDisplay), findsOneWidget);
    await tester.tap(find.byKey(const Key('themeToggle')));
    await tester.pumpAndSettle();
    verify(() => prefs.setThemeMode('dark')).called(1);
  });
}
