import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/di/injector.dart';
import '../../core/layout/responsive.dart';
import '../../core/navigation/nav_items.dart';
import '../../core/theme/app_theme.dart';
import '../../l10n/app_localizations.dart';
import '../../shared/widgets/widgets.dart';

/// Lightweight tile page behind one of the five areas. Tiles follow the same
/// permission rules as the old menu items ([AppNav.hubItems]).
class AreaHubPage extends StatelessWidget {
  const AreaHubPage({super.key, required this.area, required this.title, required this.icon, this.can});

  final NavArea area;
  final String Function(AppLocalizations) title;
  final IconData icon;

  /// Defaults to the signed-in session; overridable for tests.
  final bool Function(String)? can;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final allowed = can ?? sl<SessionManager>().session?.can ?? (_) => false;
    final tiles = AppNav.hubItems(area, can: allowed);
    return PageBody(
      children: [
        PageHeader(title: title(l10n), icon: icon),
        Padding(
          padding: EdgeInsets.symmetric(horizontal: context.pageGutter, vertical: 8),
          child: LayoutBuilder(
            builder: (context, constraints) {
              final columns = constraints.maxWidth >= 720 ? 3 : 2;
              final width = (constraints.maxWidth - 12 * (columns - 1)) / columns;
              return Wrap(
                spacing: 12,
                runSpacing: 12,
                children: [for (final t in tiles) SizedBox(width: width, child: _HubTile(item: t))],
              );
            },
          ),
        ),
      ],
    );
  }
}

class _HubTile extends StatelessWidget {
  const _HubTile({required this.item});

  final NavItem item;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final label = item.labelKey(AppLocalizations.of(context));
    return Material(
      color: theme.colorScheme.surfaceContainerHighest,
      borderRadius: BorderRadius.circular(AppRadius.md),
      child: InkWell(
        key: Key('hubTile_${item.route}'),
        borderRadius: BorderRadius.circular(AppRadius.md),
        onTap: () => context.go(item.route),
        child: Container(
          constraints: const BoxConstraints(minHeight: 112),
          padding: const EdgeInsets.all(12),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(item.icon, size: 36, color: theme.colorScheme.primary),
              const SizedBox(height: 8),
              Text(label, textAlign: TextAlign.center, style: theme.textTheme.titleSmall),
            ],
          ),
        ),
      ),
    );
  }
}
