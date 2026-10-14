import 'dart:math' show Point;

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../../../core/config/app_config.dart';
import '../../../../core/data_saver/data_saver.dart';
import '../../../../core/feature_flags/feature_flag.dart';
import '../../../../core/feature_flags/feature_flag_builder.dart'
    show flagEnabled;
import '../../../../l10n/app_localizations.dart';
import '../../../member/domain/finance_entities.dart' show toBanglaDigits;
import '../../../../shared/widgets/widgets.dart';
import '../../domain/geo.dart';
import '../../domain/land_entities.dart';
import '../../domain/map_tile_session.dart';
import '../../domain/plot_boundary_entities.dart';
import '../bloc/boundary_editor_bloc.dart';
import '../bloc/rs_lookup_cubit.dart';
import '../widgets/boundary_disclaimer_banner.dart';
import '../widgets/boundary_editor_messages.dart';
import '../widgets/boundary_editor_wizard.dart';
import '../widgets/map/map_tile_gate.dart';
import '../widgets/map/plot_map_canvas.dart'
    show kMapBoundsPadding, kMapMaxZoom, kMapMinZoom;
import '../widgets/short_disclaimer.dart';

/// Tap-to-draw polygon editor: vertices are added by tapping the map, moved
/// by dragging their markers, removed via long-press / list. Save POSTs (or
/// PUTs when editing) and the boundary goes to pending_review.
class BoundaryEditorPage extends StatelessWidget {
  const BoundaryEditorPage({
    super.key,
    this.createBloc,
    this.editing,
    this.initialPropertyId,
    this.tileProvider,
    this.wizard,
    this.dataSaver,
    this.createLookupCubit,
  });

  /// map_wizard (three steps); read from the feature flag when null.
  final bool? wizard;

  /// Data saver (Batch 7): the map asks before downloading tiles. Taken from
  /// the flag and the member's switch when null.
  final bool? dataSaver;

  /// Test seam for the RS plot lookup of step 1.
  final RsLookupCubit Function()? createLookupCubit;

  final BoundaryEditorBloc Function()? createBloc;

  /// Plot to preselect when drawing a new boundary (from the draw panel).
  final String? initialPropertyId;

  /// Overrides the network tile provider (tests).
  final TileProvider? tileProvider;

  /// Existing boundary to edit (PUT instead of POST).
  final PlotBoundary? editing;

  static const pageRoute = '/plot-map/draw';

  @override
  Widget build(BuildContext context) {
    final isWizard = wizard ?? flagEnabled(FeatureFlag.mapWizard);
    return MultiBlocProvider(
      providers: [
        BlocProvider(
          create: (_) =>
              (createBloc?.call() ?? BoundaryEditorBloc(wizard: isWizard))
                ..add(EditorStarted(
                  editing: editing,
                  // The legacy page never forwarded it; unchanged when off.
                  propertyId: isWizard ? initialPropertyId : null,
                )),
        ),
        if (isWizard)
          BlocProvider(
            create: (_) => createLookupCubit?.call() ?? RsLookupCubit(),
          ),
      ],
      child: _EditorView(
        tileProvider: tileProvider,
        wizard: isWizard,
        dataSaver: dataSaver ?? dataSaverActive(),
      ),
    );
  }
}

class _EditorView extends StatefulWidget {
  const _EditorView({
    this.tileProvider,
    this.wizard = false,
    this.dataSaver = false,
  });

  final TileProvider? tileProvider;
  final bool wizard;
  final bool dataSaver;

  @override
  State<_EditorView> createState() => _EditorViewState();
}

class _EditorViewState extends State<_EditorView> {
  final _mapController = MapController();

  /// map_wizard data-saver start: no tiles until the member asks (or already
  /// agreed this session with data saver off). Always on for the legacy editor.
  late bool _tiles = !widget.wizard || (MapTileSession.ok && !widget.dataSaver);

  void _showTiles() {
    MapTileSession.remember();
    setState(() => _tiles = true);
  }

  /// Step 1: look the chosen property's RS dag up (or clear the result).
  void _lookupFor(BoundaryEditorState s) {
    final cubit = context.read<RsLookupCubit>();
    final dag = (s.selectedProperty?.rsDag ?? '').trim();
    if (dag.isEmpty) {
      cubit.reset();
    } else {
      cubit.lookup(dag);
    }
  }

  void _fitCandidates(List<LandPlot> plots) {
    final box = SocietyBbox.around([
      for (final p in plots)
        for (final r in p.rings) ...r,
    ]);
    if (box == null) return;
    // The map may not have been built yet when a fast lookup answers.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _mapController.fitCamera(CameraFit.bounds(
        bounds: LatLngBounds(
          LatLng(box.minLat, box.minLng),
          LatLng(box.maxLat, box.maxLng),
        ),
        padding: const EdgeInsets.all(48),
        maxZoom: 18,
      ));
    });
  }

  @override
  void dispose() {
    _mapController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(loc.boundaryEditorTitle)),
      body: BlocConsumer<BoundaryEditorBloc, BoundaryEditorState>(
        listener: (context, state) {
          if (state.status == EditorStatus.saved) {
            showAppToast(context, loc.boundarySaveSuccess);
            Navigator.of(context).pop();
          }
        },
        builder: (context, state) {
          final body = _body(context, loc, state);
          if (!widget.wizard) return body;
          return MultiBlocListener(
            listeners: [
              BlocListener<BoundaryEditorBloc, BoundaryEditorState>(
                listenWhen: (a, b) =>
                    b.step == EditorStep.find &&
                    b.status == EditorStatus.ready &&
                    (a.selectedPropertyId != b.selectedPropertyId ||
                        a.status != b.status ||
                        a.step != b.step),
                listener: (_, s) => _lookupFor(s),
              ),
              BlocListener<RsLookupCubit, RsLookupState>(
                listenWhen: (a, b) =>
                    a.status != b.status && b.status == RsLookupStatus.found,
                listener: (_, s) => _fitCandidates(s.candidates),
              ),
            ],
            child: body,
          );
        },
      ),
    );
  }

  Widget _body(
    BuildContext context,
    AppLocalizations loc,
    BoundaryEditorState state,
  ) {
    if (state.status == EditorStatus.loading) {
      return const SkeletonLoader(lines: 4);
    }
    if (state.status == EditorStatus.failure && state.properties.isEmpty) {
      return InlineError(
        message: boundaryFailureMessage(state.failureKind, loc),
        onRetry: () =>
            context.read<BoundaryEditorBloc>().add(const EditorStarted()),
      );
    }
    if (widget.wizard) return _wizardLayout(state);
    return Column(
      children: [
        const BoundaryDisclaimerBanner(),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
          child: _PropertyPicker(state: state),
        ),
        Expanded(
          child: _EditorMap(
            mapController: _mapController,
            tileProvider: widget.tileProvider,
          ),
        ),
        _EditorToolbar(state: state),
      ],
    );
  }

  Widget _wizardLayout(BoundaryEditorState state) {
    final step = state.step;
    return Column(
      children: [
        WizardStepHeader(step: step),
        if (step != EditorStep.submit)
          const ShortDisclaimer(margin: EdgeInsets.fromLTRB(12, 8, 12, 0)),
        if (step == EditorStep.find)
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
            child: _PropertyPicker(state: state),
          ),
        Expanded(
          child: Stack(
            children: [
              Positioned.fill(
                child: _EditorMap(
                  mapController: _mapController,
                  tileProvider: widget.tileProvider,
                  wizard: true,
                  tilesRequested: _tiles,
                ),
              ),
              if (!_tiles)
                Positioned.fill(child: MapTileGateCard(onShow: _showTiles)),
            ],
          ),
        ),
        switch (step) {
          EditorStep.find => const FindStepPanel(),
          EditorStep.adjust => const AdjustStepPanel(),
          EditorStep.submit => const SubmitStepPanel(),
        },
      ],
    );
  }
}

class _PropertyPicker extends StatelessWidget {
  const _PropertyPicker({required this.state});

  final BoundaryEditorState state;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    final options =
        state.availableProperties.isEmpty && state.selectedProperty != null
            ? [state.selectedProperty!]
            : state.availableProperties;
    if (options.isEmpty) {
      return Row(
        children: [
          const Icon(Icons.info_outline, size: 16),
          const SizedBox(width: 6),
          Expanded(
            child: Text(loc.boundaryEditorNoProperty,
                style: Theme.of(context).textTheme.bodySmall),
          ),
        ],
      );
    }
    return InputDecorator(
      decoration: InputDecoration(
        isDense: true,
        labelText: loc.boundaryEditorPropertyLabel,
        border: const OutlineInputBorder(),
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          isDense: true,
          isExpanded: true,
          value: state.selectedPropertyId,
          items: [
            for (final p in options)
              DropdownMenuItem(
                value: p.propertyId,
                child: Text(
                  'RS ${p.rsDag ?? '—'} / CS ${p.csDag ?? '—'}'
                  '${p.landQuantity == null ? '' : ' · ${p.landQuantity} শতাংশ'}',
                  overflow: TextOverflow.ellipsis,
                ),
              ),
          ],
          onChanged: (id) {
            if (id != null) {
              context.read<BoundaryEditorBloc>().add(EditorPropertyChanged(id));
            }
          },
        ),
      ),
    );
  }
}

class _EditorMap extends StatelessWidget {
  const _EditorMap({
    required this.mapController,
    this.tileProvider,
    this.wizard = false,
    this.tilesRequested = true,
  });

  final MapController mapController;
  final TileProvider? tileProvider;

  /// map_wizard: RS candidates are outlined, one undo step per drag, and taps
  /// add points only in the "adjust" step.
  final bool wizard;
  final bool tilesRequested;

  @override
  Widget build(BuildContext context) {
    final bloc = context.read<BoundaryEditorBloc>();
    final area = SocietyBbox.tryParse(AppConfig.societyBboxRaw)
        ?.padded(kMapBoundsPadding);
    return FlutterMap(
      mapController: mapController,
      options: MapOptions(
        initialCenter: const LatLng(
          AppConfig.societyCenterLat,
          AppConfig.societyCenterLng,
        ),
        initialZoom: 17,
        minZoom: kMapMinZoom,
        maxZoom: kMapMaxZoom,
        cameraConstraint: area == null
            ? const CameraConstraint.unconstrained()
            : CameraConstraint.containCenter(
                bounds: LatLngBounds(
                  LatLng(area.minLat, area.minLng),
                  LatLng(area.maxLat, area.maxLng),
                ),
              ),
        backgroundColor: tilesRequested
            ? const Color(0xFFE0E0E0)
            : Theme.of(context).colorScheme.surfaceContainerHighest,
        onTap: (_, latLng) {
          if (wizard && bloc.state.step != EditorStep.adjust) return;
          bloc.add(EditorVertexAdded(latLng));
        },
      ),
      children: [
        if (tilesRequested)
          TileLayer(
            urlTemplate: AppConfig.mapTileUrl,
            tileProvider: tileProvider,
            userAgentPackageName: 'bd.kaundia.app',
          ),
        if (wizard) const _CandidateLayer(),
        BlocBuilder<BoundaryEditorBloc, BoundaryEditorState>(
          buildWhen: (a, b) => a.vertices != b.vertices,
          builder: (context, state) {
            final vertices = state.vertices;
            return Stack(
              children: [
                if (vertices.length >= 3)
                  PolygonLayer(
                    polygons: [
                      Polygon(
                        points: vertices,
                        color: Theme.of(context)
                            .colorScheme
                            .primary
                            .withValues(alpha: 0.25),
                        borderColor: Theme.of(context).colorScheme.primary,
                        borderStrokeWidth: 2,
                      ),
                    ],
                  ),
                if (vertices.length >= 2)
                  PolylineLayer(
                    polylines: [
                      Polyline(
                        points: vertices,
                        color: Theme.of(context).colorScheme.primary,
                        strokeWidth: 2,
                      ),
                    ],
                  ),
                MarkerLayer(
                  markers: [
                    for (var i = 0; i < vertices.length; i++)
                      _vertexMarker(context, bloc, i, vertices[i]),
                  ],
                ),
              ],
            );
          },
        ),
        if (tilesRequested)
          RichAttributionWidget(
            attributions: [TextSourceAttribution('OpenStreetMap contributors')],
          ),
      ],
    );
  }

  Marker _vertexMarker(
    BuildContext context,
    BoundaryEditorBloc bloc,
    int index,
    LatLng point,
  ) {
    return Marker(
      point: point,
      width: 44,
      height: 44,
      alignment: Alignment.center,
      child: GestureDetector(
        onPanStart:
            wizard ? (_) => bloc.add(EditorVertexMoveStarted(index)) : null,
        onPanEnd:
            wizard ? (_) => bloc.add(const EditorVertexMoveEnded()) : null,
        onPanCancel:
            wizard ? () => bloc.add(const EditorVertexMoveEnded()) : null,
        onPanUpdate: (details) {
          // Convert the pixel delta to a geographic offset around the vertex.
          final camera = mapController.camera;
          final projected = camera.project(point);
          final moved = camera.pointToLatLng(
            projected +
                Point<double>(
                  details.delta.dx.toDouble(),
                  details.delta.dy.toDouble(),
                ),
          );
          bloc.add(EditorVertexMoved(index, moved));
        },
        onLongPress: () => bloc.add(EditorVertexRemoved(index)),
        child: Tooltip(
          message: '${index + 1}',
          child: Icon(
            Icons.location_on,
            color: Theme.of(context).colorScheme.primary,
            size: 32,
          ),
        ),
      ),
    );
  }
}

/// map_wizard: the RS plot(s) found in step 1, outlined on the map.
class _CandidateLayer extends StatelessWidget {
  const _CandidateLayer();

  @override
  Widget build(BuildContext context) {
    final lookup = context.watch<RsLookupCubit>().state;
    if (lookup.candidates.isEmpty) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    const amber = Color(0xFFC9861E);
    return PolygonLayer(
      polygons: [
        for (final plot in lookup.candidates)
          for (final ring in plot.rings)
            Polygon(
              points: ring,
              color: amber.withValues(alpha: 0.18),
              borderColor:
                  identical(plot, lookup.selected) ? scheme.primary : amber,
              borderStrokeWidth: identical(plot, lookup.selected) ? 4 : 2,
            ),
      ],
    );
  }
}

class _EditorToolbar extends StatelessWidget {
  const _EditorToolbar({required this.state});

  final BoundaryEditorState state;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    final bloc = context.read<BoundaryEditorBloc>();
    final theme = Theme.of(context);
    final validation = state.validation;

    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          border:
              Border(top: BorderSide(color: theme.colorScheme.outlineVariant)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    '${loc.boundaryEditorVertices(
                      _digits(context, '${state.vertices.length}'),
                    )} · '
                    '${loc.boundaryAreaValues(
                      _digits(context, validation.areaSqm.toStringAsFixed(1)),
                      _digits(context,
                          validation.areaShotangsho.toStringAsFixed(2)),
                    )} '
                    '(${loc.boundaryAreaEstimateTag})',
                    style: theme.textTheme.bodySmall,
                  ),
                ),
                IconButton(
                  tooltip: loc.boundaryEditorUndo,
                  onPressed: state.canUndo
                      ? () => bloc.add(const EditorUndoPressed())
                      : null,
                  icon: const Icon(Icons.undo),
                ),
                IconButton(
                  tooltip: loc.boundaryEditorClear,
                  onPressed: state.vertices.isEmpty
                      ? null
                      : () => bloc.add(const EditorCleared()),
                  icon: const Icon(Icons.layers_clear_outlined),
                ),
                const SizedBox(width: 4),
                FilledButton(
                  onPressed:
                      state.canSave && state.status != EditorStatus.saving
                          ? () => saveBoundaryWithConfirm(context, bloc, state)
                          : null,
                  child: state.status == EditorStatus.saving
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : Text(loc.boundaryEditorSave),
                ),
              ],
            ),
            if (validation.error != null)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Row(
                  children: [
                    Icon(Icons.warning_amber_outlined,
                        size: 16, color: theme.colorScheme.error),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        boundaryErrorLabel(validation.error!, loc),
                        style: theme.textTheme.bodySmall
                            ?.copyWith(color: theme.colorScheme.error),
                      ),
                    ),
                  ],
                ),
              ),
            if (validation.areaMismatch)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Row(
                  children: [
                    Icon(Icons.warning_amber_outlined,
                        size: 16, color: theme.colorScheme.tertiary),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        loc.plotMapValidationAreaMismatch,
                        style: theme.textTheme.bodySmall
                            ?.copyWith(color: theme.colorScheme.tertiary),
                      ),
                    ),
                  ],
                ),
              ),
            if (validation.error == null && state.vertices.length >= 3)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Row(
                  children: [
                    const Icon(Icons.check_circle,
                        size: 16, color: Color(0xFF2E7D32)),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        loc.plotMapValidationOk,
                        style: theme.textTheme.bodySmall
                            ?.copyWith(color: const Color(0xFF2E7D32)),
                      ),
                    ),
                  ],
                ),
              ),
            if (state.status == EditorStatus.failure &&
                state.failureKind != null)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  boundaryFailureMessage(state.failureKind, loc),
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: theme.colorScheme.error),
                ),
              ),
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                loc.boundaryEditorAddHint,
                style: theme.textTheme.bodySmall
                    ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _digits(BuildContext context, String text) =>
      Localizations.localeOf(context).languageCode == 'bn'
          ? toBanglaDigits(text)
          : text;
}
