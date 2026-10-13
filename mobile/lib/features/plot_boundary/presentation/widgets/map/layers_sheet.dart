import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../../l10n/app_localizations.dart';
import '../../../domain/land_entities.dart';
import '../../bloc/land_map_bloc.dart';
import '../../bloc/plot_map_bloc.dart';

/// "আরও লেয়ার" (map_wizard): one sheet replaces the mode tabs and the
/// basemap button. Pick the view (my land / BDS / RAJUK) and satellite.
/// [allowSatellite] is false while data saver is on (satellite tiles are big).
Future<void> showLayersSheet(
  BuildContext context, {
  required PlotMapBloc plot,
  required LandMapBloc land,
  required ValueChanged<MapMode> onMode,
  bool allowSatellite = true,
}) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (_) => MultiBlocProvider(
      providers: [
        BlocProvider<PlotMapBloc>.value(value: plot),
        BlocProvider<LandMapBloc>.value(value: land),
      ],
      child: LayersSheet(onMode: onMode, allowSatellite: allowSatellite),
    ),
  );
}

class LayersSheet extends StatelessWidget {
  const LayersSheet({
    super.key,
    required this.onMode,
    this.allowSatellite = true,
  });

  final ValueChanged<MapMode> onMode;
  final bool allowSatellite;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    final views = [
      (MapMode.boundaries, Icons.edit_location_alt_outlined, loc.mapWizardLayerMine),
      (MapMode.bds, Icons.map_outlined, loc.mapWizardLayerBds),
      (MapMode.rajuk, Icons.description_outlined, loc.mapWizardLayerRajuk),
    ];
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(8, 0, 8, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
              child: Text(
                loc.mapWizardLayersTitle,
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(fontWeight: FontWeight.w700),
              ),
            ),
            BlocBuilder<LandMapBloc, LandMapState>(
              buildWhen: (a, b) => a.mode != b.mode,
              builder: (context, land) => Column(
                children: [
                  for (final (mode, icon, label) in views)
                    _ViewTile(
                      key: Key('layerView_${mode.name}'),
                      icon: icon,
                      label: label,
                      selected: land.mode == mode,
                      onTap: () {
                        Navigator.of(context).pop();
                        onMode(mode);
                      },
                    ),
                ],
              ),
            ),
            if (allowSatellite)
              BlocBuilder<PlotMapBloc, PlotMapState>(
                buildWhen: (a, b) => a.layer != b.layer,
                builder: (context, plot) => SwitchListTile(
                  key: const Key('layerSatellite'),
                  secondary: const Icon(Icons.satellite_alt_outlined),
                  title: Text(loc.mapWizardLayerSatellite),
                  value: plot.layer == MapLayer.satellite,
                  onChanged: (on) => context.read<PlotMapBloc>().add(
                        PlotMapLayerChanged(
                          on ? MapLayer.satellite : MapLayer.street,
                        ),
                      ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _ViewTile extends StatelessWidget {
  const _ViewTile({
    super.key,
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      inMutuallyExclusiveGroup: true,
      selected: selected,
      child: ListTile(
        minTileHeight: 52,
        leading: Icon(icon, color: selected ? scheme.primary : null),
        title: Text(
          label,
          style: TextStyle(
            fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
          ),
        ),
        trailing: Icon(
          selected ? Icons.radio_button_checked : Icons.radio_button_unchecked,
          color: selected ? scheme.primary : scheme.onSurfaceVariant,
        ),
        selected: selected,
        onTap: onTap,
      ),
    );
  }
}
