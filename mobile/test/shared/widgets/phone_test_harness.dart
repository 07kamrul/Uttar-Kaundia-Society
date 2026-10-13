import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:kaundia_app/core/theme/app_theme.dart';
import 'package:kaundia_app/l10n/app_localizations.dart';

/// MaterialApp with the app's localizations, for phone widget tests.
Widget phoneHarness(Widget child, {String lang = 'en'}) => MaterialApp(
      theme: AppTheme.light(),
      locale: Locale(lang),
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: AppLocalizations.supportedLocales,
      home: Scaffold(
        body: SingleChildScrollView(
          child: Padding(padding: const EdgeInsets.all(8), child: child),
        ),
      ),
    );
