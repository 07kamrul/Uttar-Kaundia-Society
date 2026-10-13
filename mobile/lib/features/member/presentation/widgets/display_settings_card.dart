import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../l10n/app_localizations.dart';
import '../../../../shared/widgets/widgets.dart';
import '../../../settings/settings_bloc.dart';

/// Profile > "প্রদর্শন": the theme toggle (moved here from the app bar when
/// nav_five_areas is on). Cycles system, dark, light.
class DisplaySettingsCard extends StatelessWidget {
  const DisplaySettingsCard({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final mode = context.select<SettingsBloc, String>((b) => b.state.themeMode);
    return AppCard(
      title: l10n.profileDisplay,
      child: ListTile(
        key: const Key('themeToggle'),
        contentPadding: EdgeInsets.zero,
        leading: Icon(switch (mode) {
          'dark' => Icons.dark_mode_outlined,
          'light' => Icons.light_mode_outlined,
          _ => Icons.brightness_auto_outlined,
        }),
        title: Text(l10n.commonTheme),
        onTap: () {
          final bloc = context.read<SettingsBloc>();
          bloc.add(SettingsThemeChanged(switch (bloc.state.themeMode) {
            'dark' => 'light',
            'light' => 'system',
            _ => 'dark',
          }));
        },
      ),
    );
  }
}
