import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import 'core/accessibility/display_prefs.dart';
import 'core/accessibility/text_scale.dart';
import 'core/auth/auth_repository.dart';
import 'core/di/injector.dart';
import 'core/feature_flags/feature_flag.dart';
import 'core/feature_flags/feature_flag_builder.dart';
import 'core/theme/app_theme.dart';
import 'core/router/app_router.dart';
import 'features/auth/bloc/auth_bloc.dart';
import 'features/settings/settings_bloc.dart';
import 'l10n/app_localizations.dart';

class KaundiaApp extends StatefulWidget {
  const KaundiaApp({super.key});

  @override
  State<KaundiaApp> createState() => _KaundiaAppState();
}

class _KaundiaAppState extends State<KaundiaApp> {
  late final GoRouter _router;

  @override
  void initState() {
    super.initState();
    _router = buildRouter();
    routerNotifier.addListener(_refreshRouter);
  }

  void _refreshRouter() {
    if (mounted) _router.refresh();
  }

  @override
  void dispose() {
    routerNotifier.removeListener(_refreshRouter);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MultiBlocProvider(
      providers: [
        BlocProvider<SettingsBloc>(create: (_) => SettingsBloc()),
        BlocProvider<AuthBloc>(create: (_) {
          final bloc = AuthBloc(repository: sl<AuthRepository>());
          final restored = sl<SessionManager>().session;
          if (restored != null) bloc.add(AuthSessionRestored(restored));
          return bloc;
        }),
      ],
      child: BlocBuilder<SettingsBloc, SettingsState>(
        builder: (context, settings) {
          // ui_a11y_v2: bigger type, 48 px targets and the member's "লেখা বড়
          // করুন" factor; flag off leaves theme and text scale untouched.
          final display = sl.isRegistered<DisplayPrefs>() ? sl<DisplayPrefs>() : null;
          return FeatureFlagBuilder(
            flag: FeatureFlag.uiA11yV2,
            builder: (context, a11y) => ListenableBuilder(
              listenable: display ?? ChangeNotifier(),
              builder: (context, _) => MaterialApp.router(
                onGenerateTitle: (context) => AppLocalizations.of(context).brandOrgName,
                routerConfig: _router,
                themeMode: settings.materialThemeMode,
                theme: AppTheme.light(a11yV2: a11y),
                darkTheme: AppTheme.dark(a11yV2: a11y),
                locale: settings.locale,
                supportedLocales: AppLocalizations.supportedLocales,
                localizationsDelegates: AppLocalizations.localizationsDelegates,
                debugShowCheckedModeBanner: false,
                builder: a11y
                    ? (context, child) =>
                        a11yTextScaleBuilder(context, child, pref: display?.textScale ?? 1.0)
                    : null,
              ),
            ),
          );
        },
      ),
    );
  }
}
