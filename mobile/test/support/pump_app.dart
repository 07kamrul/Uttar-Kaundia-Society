import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/l10n/app_localizations.dart';

/// Tall phone-ish viewport so sheets and long lists never need scrolling in tests.
void useTallViewport(WidgetTester tester, {double width = 600, double height = 2400}) {
  tester.view.physicalSize = Size(width, height);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

Widget appWith(Widget home, {Locale locale = const Locale('bn')}) => MaterialApp(
      locale: locale,
      theme: ThemeData(snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating)),
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: AppLocalizations.supportedLocales,
      home: Scaffold(body: home),
    );

Future<void> pumpBn(WidgetTester tester, Widget home) async {
  useTallViewport(tester);
  await tester.pumpWidget(appWith(home));
  await tester.pumpAndSettle();
}
