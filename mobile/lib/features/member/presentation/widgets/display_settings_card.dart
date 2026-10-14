import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/accessibility/display_prefs.dart';
import '../../../../core/di/injector.dart';
import '../../../../core/feature_flags/feature_flag.dart';
import '../../../../core/feature_flags/feature_flag_builder.dart';
import '../../../../l10n/app_localizations.dart';
import '../../../../shared/widgets/widgets.dart';
import '../../../settings/settings_bloc.dart';

/// Profile > "প্রদর্শন": the theme toggle (moved here from the app bar when
/// nav_five_areas is on), cycling system, dark, light. With ui_a11y_v2 it also
/// has "লেখা বড় করুন", with data_saver "ডেটা সাশ্রয়".
class DisplaySettingsCard extends StatelessWidget {
  const DisplaySettingsCard({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final mode = context.select<SettingsBloc, String>((b) => b.state.themeMode);
    final prefs = sl.isRegistered<DisplayPrefs>() ? sl<DisplayPrefs>() : null;
    final theme = ListTile(
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
    );
    if (prefs == null) return AppCard(title: l10n.profileDisplay, child: theme);
    return AppCard(
      title: l10n.profileDisplay,
      child: ListenableBuilder(
        listenable: prefs,
        builder: (context, _) => Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            theme,
            FeatureFlagBuilder(
              flag: FeatureFlag.uiA11yV2,
              builder: (_, on) => on
                  ? _SwitchRow(
                      switchKey: const Key('textLargeSwitch'),
                      icon: Icons.text_increase,
                      title: l10n.settingsTextLarge,
                      value: prefs.textLarge,
                      onChanged: prefs.setTextLarge,
                    )
                  : const SizedBox.shrink(),
            ),
            FeatureFlagBuilder(
              flag: FeatureFlag.dataSaver,
              builder: (_, on) => on
                  ? _SwitchRow(
                      switchKey: const Key('dataSaverSwitch'),
                      icon: Icons.data_saver_on,
                      title: l10n.settingsDataSaver,
                      subtitle: l10n.settingsDataSaverHint,
                      value: prefs.dataSaver,
                      onChanged: prefs.setDataSaver,
                    )
                  : const SizedBox.shrink(),
            ),
          ],
        ),
      ),
    );
  }
}

class _SwitchRow extends StatelessWidget {
  const _SwitchRow({
    required this.switchKey,
    required this.icon,
    required this.title,
    required this.value,
    required this.onChanged,
    this.subtitle,
  });

  final Key switchKey;
  final IconData icon;
  final String title;
  final String? subtitle;
  final bool value;
  final Future<void> Function(bool) onChanged;

  @override
  Widget build(BuildContext context) => ListTile(
        contentPadding: EdgeInsets.zero,
        minTileHeight: 56,
        leading: Icon(icon),
        title: Text(title),
        subtitle: subtitle == null ? null : Text(subtitle!),
        trailing: Switch(key: switchKey, value: value, onChanged: onChanged),
        onTap: () => onChanged(!value),
      );
}
