import 'package:flutter/material.dart';

import '../../../../../l10n/app_localizations.dart';

/// Centred card shown instead of the basemap until the member asks for it
/// (map_wizard data-saver start). Tapping it adds the street layer.
class MapTileGateCard extends StatelessWidget {
  const MapTileGateCard({super.key, required this.onShow});

  final VoidCallback onShow;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    final theme = Theme.of(context);
    return Center(
      child: Material(
        elevation: 3,
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 14),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              FilledButton.icon(
                key: const Key('mapTileGateButton'),
                onPressed: onShow,
                style: FilledButton.styleFrom(minimumSize: const Size(48, 52)),
                icon: const Icon(Icons.map_outlined),
                label: Text(loc.mapWizardShowMap),
              ),
              const SizedBox(height: 8),
              Text(
                loc.mapWizardShowMapHint,
                style: theme.textTheme.bodySmall,
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
