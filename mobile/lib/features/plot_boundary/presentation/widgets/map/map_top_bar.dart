import 'package:flutter/material.dart';

import '../../../../../l10n/app_localizations.dart';
import '../../../domain/land_entities.dart';
import 'map_mode_tabs.dart';
import 'map_search_field.dart';

/// Floating toolbar above the map: search, my-location, draw, mode tabs and
/// transient notices. Presentational; the page wires every callback.
class MapTopBar extends StatelessWidget {
  const MapTopBar({
    super.key,
    required this.mode,
    required this.searchController,
    required this.searchHint,
    required this.onSearchChanged,
    required this.onSearchSubmitted,
    required this.onSearchCleared,
    required this.isLocating,
    required this.onLocate,
    required this.canDraw,
    required this.onDraw,
    required this.onModeChanged,
    this.notices = const [],
    this.wizard = false,
    this.onLayers,
    this.onTourAgain,
    this.layersKey,
    this.helpKey,
    this.drawKey,
  });

  final MapMode mode;
  final TextEditingController searchController;
  final String searchHint;
  final ValueChanged<String> onSearchChanged;
  final ValueChanged<String> onSearchSubmitted;
  final VoidCallback onSearchCleared;
  final bool isLocating;
  final VoidCallback onLocate;
  final bool canDraw;
  final VoidCallback onDraw;
  final ValueChanged<MapMode> onModeChanged;

  /// Short warnings under the tabs (dag not found, location error...).
  final List<String> notices;

  /// map_wizard: "আরও লেয়ার" and a "?" menu replace the mode tabs.
  final bool wizard;
  final VoidCallback? onLayers;
  final VoidCallback? onTourAgain;

  /// Coach-mark targets of the first-time tour.
  final GlobalKey? layersKey;
  final GlobalKey? helpKey;
  final GlobalKey? drawKey;

  /// Below this width the draw button collapses to an icon.
  static const double _wideLayoutWidth = 420;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    final showDraw = canDraw && mode == MapMode.boundaries;
    final wide = MediaQuery.sizeOf(context).width >= _wideLayoutWidth;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: MapSearchField(
                controller: searchController,
                hint: searchHint,
                onChanged: onSearchChanged,
                onSubmitted: onSearchSubmitted,
                onCleared: onSearchCleared,
              ),
            ),
            const SizedBox(width: 8),
            _RoundButton(
              tooltip: loc.boundaryMyLocation,
              onPressed: isLocating ? null : onLocate,
              child: isLocating
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.my_location, size: 20),
            ),
            if (showDraw) ...[
              const SizedBox(width: 8),
              KeyedSubtree(
                key: drawKey,
                child: wide
                    ? FilledButton.icon(
                        onPressed: onDraw,
                        style: FilledButton.styleFrom(
                          minimumSize: const Size(48, 48),
                        ),
                        icon: const Icon(Icons.edit_outlined, size: 18),
                        label: Text(loc.plotMapDrawOpen),
                      )
                    : _RoundButton(
                        tooltip: loc.plotMapDrawOpen,
                        filled: true,
                        onPressed: onDraw,
                        child: const Icon(Icons.edit_outlined, size: 20),
                      ),
              ),
            ],
          ],
        ),
        const SizedBox(height: 8),
        if (wizard)
          _WizardBar(
            onLayers: onLayers,
            onTourAgain: onTourAgain,
            layersKey: layersKey,
            helpKey: helpKey,
          )
        else
          MapModeTabs(mode: mode, onChanged: onModeChanged),
        for (final notice in notices) _Notice(text: notice),
      ],
    );
  }
}

/// map_wizard: one "আরও লেয়ার" button and the "?" help menu.
class _WizardBar extends StatelessWidget {
  const _WizardBar({
    this.onLayers,
    this.onTourAgain,
    this.layersKey,
    this.helpKey,
  });

  final VoidCallback? onLayers;
  final VoidCallback? onTourAgain;
  final GlobalKey? layersKey;
  final GlobalKey? helpKey;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    return Row(
      children: [
        Expanded(
          child: KeyedSubtree(
            key: layersKey,
            child: Material(
              elevation: 3,
              color: scheme.surface,
              borderRadius: BorderRadius.circular(16),
              child: InkWell(
                key: const Key('moreLayersButton'),
                borderRadius: BorderRadius.circular(16),
                onTap: onLayers,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(minHeight: 48),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.layers_outlined, color: scheme.primary),
                      const SizedBox(width: 8),
                      Text(
                        loc.mapWizardMoreLayers,
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          color: scheme.primary,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(width: 8),
        KeyedSubtree(
          key: helpKey,
          child: Material(
            elevation: 3,
            color: scheme.surface,
            shape: const CircleBorder(),
            child: PopupMenuButton<int>(
              key: const Key('mapHelpMenu'),
              tooltip: loc.mapWizardHelpTooltip,
              icon: const Icon(Icons.help_outline),
              constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
              onSelected: (_) => onTourAgain?.call(),
              itemBuilder: (_) => [
                PopupMenuItem<int>(
                  value: 0,
                  height: 48,
                  child: Text(loc.mapWizardTourAgain),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _RoundButton extends StatelessWidget {
  const _RoundButton({
    required this.tooltip,
    required this.onPressed,
    required this.child,
    this.filled = false,
  });

  final String tooltip;
  final VoidCallback? onPressed;
  final Widget child;
  final bool filled;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Tooltip(
      message: tooltip,
      child: Material(
        elevation: 3,
        color: filled ? scheme.primary : scheme.surface,
        shape: const CircleBorder(),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onPressed,
          child: SizedBox(
            width: 48,
            height: 48,
            child: IconTheme.merge(
              data: IconThemeData(
                color: filled ? scheme.onPrimary : scheme.onSurface,
              ),
              child: Center(child: child),
            ),
          ),
        ),
      ),
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Semantics(
        liveRegion: true,
        child: Material(
          color: scheme.errorContainer,
          borderRadius: BorderRadius.circular(12),
          elevation: 2,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(
              children: [
                Icon(Icons.info_outline,
                    size: 16, color: scheme.onErrorContainer),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    text,
                    style: TextStyle(
                      fontSize: 12.5,
                      color: scheme.onErrorContainer,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
