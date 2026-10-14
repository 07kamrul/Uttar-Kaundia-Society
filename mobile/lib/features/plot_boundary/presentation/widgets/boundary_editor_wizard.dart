import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:latlong2/latlong.dart';

import '../../../../l10n/app_localizations.dart';
import '../../domain/geo.dart';
import '../../domain/land_entities.dart';
import '../../domain/rs_match.dart';
import '../bloc/boundary_editor_bloc.dart';
import '../bloc/rs_lookup_cubit.dart';
import 'boundary_editor_messages.dart';
import 'owner_bottom_sheet.dart' show formatDigits;
import 'short_disclaimer.dart';

/// Widgets of the three-step map_wizard editor: find the RS plot, set the
/// boundary, submit. Each panel reads the editor bloc and the RS lookup cubit
/// from the context; the page owns the map.

const double _minTarget = 48;

/// The ring copied into the editor: the largest part of a MultiPolygon.
List<LatLng> ringOfPlot(LandPlot plot) {
  if (plot.rings.isEmpty) return const [];
  return plot.rings.reduce(
    (a, b) => estimateAreaSqm(a) >= estimateAreaSqm(b) ? a : b,
  );
}

String _plotLabel(AppLocalizations loc, BuildContext context, LandPlot p) {
  final dag = formatDigits(context, p.rsPlotNo ?? p.dag ?? p.plotNo ?? '—');
  final sheet = p.sheet;
  return sheet == null || sheet.isEmpty
      ? loc.mapWizardCandidateNoSheet(dag)
      : loc.mapWizardCandidate(dag, formatDigits(context, sheet));
}

/// "ধাপ ১ / ৩ — দাগ খুঁজুন".
class WizardStepHeader extends StatelessWidget {
  const WizardStepHeader({super.key, required this.step});

  final EditorStep step;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    final title = switch (step) {
      EditorStep.find => loc.mapWizardStepFind,
      EditorStep.adjust => loc.mapWizardStepAdjust,
      EditorStep.submit => loc.mapWizardStepSubmit,
    };
    final text = loc.mapWizardStepHeader(
      formatDigits(context, '${step.index + 1}'),
      title,
    );
    return Container(
      width: double.infinity,
      color: Theme.of(context).colorScheme.primaryContainer,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Semantics(
        header: true,
        child: Text(
          text,
          style: Theme.of(context)
              .textTheme
              .titleMedium
              ?.copyWith(fontWeight: FontWeight.w700),
        ),
      ),
    );
  }
}

/// Container shared by the bottom panels: scrolls instead of overflowing.
class _PanelFrame extends StatelessWidget {
  const _PanelFrame({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final maxHeight = MediaQuery.sizeOf(context).height * 0.5;
    // A Material (not a coloured box) so list tiles can paint their ink.
    return Material(
      color: theme.colorScheme.surface,
      child: SafeArea(
        top: false,
        child: Container(
          constraints: BoxConstraints(maxHeight: maxHeight),
          decoration: BoxDecoration(
            border: Border(
                top: BorderSide(color: theme.colorScheme.outlineVariant)),
          ),
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
            child: child,
          ),
        ),
      ),
    );
  }
}

/// Step 1: the RS plot behind the chosen property, found automatically.
class FindStepPanel extends StatefulWidget {
  const FindStepPanel({super.key});

  @override
  State<FindStepPanel> createState() => _FindStepPanelState();
}

class _FindStepPanelState extends State<FindStepPanel> {
  final _dag = TextEditingController();
  bool _searching = false;

  @override
  void dispose() {
    _dag.dispose();
    super.dispose();
  }

  void _search(RsLookupCubit cubit) => cubit.lookup(_dag.text);

  void _useSelected(LandPlot plot) {
    context.read<BoundaryEditorBloc>()
      ..add(EditorPrefilledFromDag(ringOfPlot(plot)))
      ..add(const EditorStepChanged(EditorStep.adjust));
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final cubit = context.read<RsLookupCubit>();
    final editor = context.watch<BoundaryEditorBloc>().state;
    final lookup = context.watch<RsLookupCubit>().state;
    final propertyHasRs =
        (editor.selectedProperty?.rsDag ?? '').trim().isNotEmpty;

    final Widget status = switch (lookup.status) {
      RsLookupStatus.loading => Row(
          children: [
            const SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            const SizedBox(width: 10),
            Expanded(child: Text(loc.mapWizardSearching)),
          ],
        ),
      RsLookupStatus.found => Text(
          lookup.candidates.length == 1
              ? loc.mapWizardFoundOne
              : loc.mapWizardFoundMany(
                  formatDigits(context, '${lookup.candidates.length}')),
        ),
      RsLookupStatus.notFound => Text(loc.plotMapViewsDagNotFound),
      RsLookupStatus.failure => Row(
          children: [
            Expanded(child: Text(loc.mapWizardLookupFailed)),
            TextButton(
              onPressed: () => cubit.lookup(lookup.query),
              child: Text(loc.commonRetry),
            ),
          ],
        ),
      RsLookupStatus.idle =>
        Text(propertyHasRs ? loc.mapWizardSearching : loc.mapWizardNoDagOnPlot),
    };

    return _PanelFrame(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(liveRegion: true, child: status),
          if (lookup.candidates.length > 1)
            for (var i = 0; i < lookup.candidates.length; i++)
              _CandidateTile(
                label: _plotLabel(loc, context, lookup.candidates[i]),
                selected: lookup.selected == lookup.candidates[i],
                onTap: () => cubit.select(i),
              ),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: lookup.selected == null
                ? null
                : () => _useSelected(lookup.selected!),
            style: FilledButton.styleFrom(
              minimumSize: const Size(_minTarget, _minTarget),
            ),
            child: Text(loc.mapWizardThisIsMine),
          ),
          const SizedBox(height: 8),
          OutlinedButton(
            onPressed: () => setState(() => _searching = !_searching),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size(_minTarget, _minTarget),
            ),
            child: Text(loc.mapWizardOtherDag),
          ),
          if (_searching)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      key: const Key('wizardDagField'),
                      controller: _dag,
                      keyboardType: TextInputType.text,
                      textInputAction: TextInputAction.search,
                      onSubmitted: (_) => _search(cubit),
                      decoration: InputDecoration(
                        isDense: true,
                        labelText: loc.mapWizardDagFieldLabel,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  FilledButton(
                    onPressed: () => _search(cubit),
                    style: FilledButton.styleFrom(
                      minimumSize: const Size(_minTarget, _minTarget),
                    ),
                    child: Text(loc.mapWizardSearchButton),
                  ),
                ],
              ),
            ),
          TextButton(
            onPressed: () => context
                .read<BoundaryEditorBloc>()
                .add(const EditorStepChanged(EditorStep.adjust)),
            style: TextButton.styleFrom(
              minimumSize: const Size(_minTarget, _minTarget),
              foregroundColor: theme.colorScheme.primary,
            ),
            child: Text(loc.mapWizardNotFoundDraw, textAlign: TextAlign.center),
          ),
        ],
      ),
    );
  }
}

class _CandidateTile extends StatelessWidget {
  const _CandidateTile({
    required this.label,
    required this.selected,
    required this.onTap,
  });

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
        minTileHeight: _minTarget,
        dense: true,
        title: Text(label),
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

/// Step 2: edit the shape with labelled undo / redo and live area figures.
class AdjustStepPanel extends StatelessWidget {
  const AdjustStepPanel({super.key});

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final bloc = context.read<BoundaryEditorBloc>();
    final state = context.watch<BoundaryEditorBloc>().state;
    final selected = context.watch<RsLookupCubit>().state.selected;
    final validation = state.validation;
    String d(String s) => formatDigits(context, s);
    final declared = state.selectedProperty?.landQuantity;
    ButtonStyle target() =>
        TextButton.styleFrom(minimumSize: const Size(_minTarget, _minTarget));

    Widget note(IconData icon, String text, Color color) => Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Row(
            children: [
              Icon(icon, size: 18, color: color),
              const SizedBox(width: 6),
              Expanded(
                child: Text(text,
                    style: theme.textTheme.bodyMedium?.copyWith(color: color)),
              ),
            ],
          ),
        );

    return _PanelFrame(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Wrap(
            spacing: 4,
            children: [
              TextButton.icon(
                onPressed: state.canUndo
                    ? () => bloc.add(const EditorUndoPressed())
                    : null,
                style: target(),
                icon: const Icon(Icons.undo),
                label: Text(loc.mapWizardUndoText),
              ),
              TextButton.icon(
                onPressed: state.canRedo
                    ? () => bloc.add(const EditorRedoPressed())
                    : null,
                style: target(),
                icon: const Icon(Icons.redo),
                label: Text(loc.mapWizardRedoText),
              ),
              TextButton.icon(
                onPressed: state.vertices.isEmpty
                    ? null
                    : () => bloc.add(const EditorCleared()),
                style: target(),
                icon: const Icon(Icons.layers_clear_outlined),
                label: Text(loc.mapWizardClearAll),
              ),
            ],
          ),
          if (selected != null)
            Wrap(
              spacing: 8,
              runSpacing: 4,
              children: [
                OutlinedButton(
                  onPressed: () =>
                      bloc.add(EditorPrefilledFromDag(ringOfPlot(selected))),
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size(_minTarget, _minTarget),
                  ),
                  child: Text(loc.mapWizardStartFromDag),
                ),
                OutlinedButton(
                  onPressed: state.vertices.isEmpty
                      ? null
                      : () => bloc.add(const EditorCleared()),
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size(_minTarget, _minTarget),
                  ),
                  child: Text(loc.mapWizardDrawMyself),
                ),
              ],
            ),
          const SizedBox(height: 6),
          Text(
            '${loc.boundaryEditorVertices(d('${state.vertices.length}'))} · '
            '${loc.plotMapValidationArea}: ${loc.boundaryAreaValues(
              d(validation.areaSqm.toStringAsFixed(1)),
              d(validation.areaShotangsho.toStringAsFixed(2)),
            )} (${loc.boundaryAreaEstimateTag})',
            style: theme.textTheme.bodyMedium,
          ),
          if (declared != null && declared.isNotEmpty)
            Text(loc.mapWizardDeclaredLand(d(declared)),
                style: theme.textTheme.bodyMedium),
          if (validation.error != null)
            note(
                Icons.warning_amber_outlined,
                boundaryErrorLabel(validation.error!, loc),
                theme.colorScheme.error),
          if (validation.areaMismatch)
            note(Icons.warning_amber_outlined,
                loc.plotMapValidationAreaMismatch, theme.colorScheme.tertiary),
          if (validation.error == null && state.vertices.length >= 3)
            note(Icons.check_circle, loc.plotMapValidationOk,
                const Color(0xFF2E7D32)),
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(loc.boundaryEditorAddHint,
                style: theme.textTheme.bodySmall),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              TextButton(
                onPressed: () =>
                    bloc.add(const EditorStepChanged(EditorStep.find)),
                style: target(),
                child: Text(loc.mapWizardBack),
              ),
              const Spacer(),
              FilledButton(
                onPressed: validation.canSave
                    ? () => bloc.add(const EditorStepChanged(EditorStep.submit))
                    : null,
                style: FilledButton.styleFrom(
                  minimumSize: const Size(_minTarget, _minTarget),
                ),
                child: Text(loc.mapWizardNext),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Step 3: a plain summary, then "জমা দিন".
class SubmitStepPanel extends StatefulWidget {
  const SubmitStepPanel({super.key});

  @override
  State<SubmitStepPanel> createState() => _SubmitStepPanelState();
}

class _SubmitStepPanelState extends State<SubmitStepPanel> {
  RsMatch? _match;

  @override
  void initState() {
    super.initState();
    final vertices = context.read<BoundaryEditorBloc>().state.vertices;
    final candidates = context.read<RsLookupCubit>().state.candidates;
    _match = bestRsMatch(vertices, candidates);
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final bloc = context.read<BoundaryEditorBloc>();
    final state = context.watch<BoundaryEditorBloc>().state;
    final validation = state.validation;
    final property = state.selectedProperty;
    final saving = state.status == EditorStatus.saving;
    String d(String s) => formatDigits(context, s);
    final match = _match;

    Widget row(String label, String value) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 3),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: 130,
                child: Text(label, style: theme.textTheme.bodySmall),
              ),
              Expanded(
                child: Text(value,
                    style: theme.textTheme.bodyMedium
                        ?.copyWith(fontWeight: FontWeight.w600)),
              ),
            ],
          ),
        );

    return _PanelFrame(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          row(loc.mapWizardSummaryProperty,
              'RS ${d(property?.rsDag ?? '—')} / CS ${d(property?.csDag ?? '—')}'),
          row(loc.mapWizardSummaryDag,
              d(property?.rsDag ?? property?.csDag ?? '—')),
          row(
            loc.mapWizardSummaryArea,
            loc.boundaryAreaValues(
              d(validation.areaSqm.toStringAsFixed(1)),
              d(validation.areaShotangsho.toStringAsFixed(2)),
            ),
          ),
          row(
            loc.mapWizardSummaryMatch,
            match == null
                ? loc.mapWizardNoMatch
                : loc.mapWizardMatchValue(
                    d(match.matchPct.toStringAsFixed(0)),
                    d(match.rsPlotNo),
                  ),
          ),
          if (match != null && match.diverges)
            Text(loc.mapWizardMatchLow,
                style: theme.textTheme.bodyMedium
                    ?.copyWith(color: theme.colorScheme.tertiary)),
          if (validation.areaMismatch)
            Text(loc.plotMapValidationAreaMismatch,
                style: theme.textTheme.bodyMedium
                    ?.copyWith(color: theme.colorScheme.tertiary)),
          if (state.status == EditorStatus.failure && state.failureKind != null)
            Text(boundaryFailureMessage(state.failureKind, loc),
                style: theme.textTheme.bodyMedium
                    ?.copyWith(color: theme.colorScheme.error)),
          const SizedBox(height: 8),
          const ShortDisclaimer(),
          const SizedBox(height: 8),
          Row(
            children: [
              TextButton(
                onPressed: saving
                    ? null
                    : () =>
                        bloc.add(const EditorStepChanged(EditorStep.adjust)),
                style: TextButton.styleFrom(
                  minimumSize: const Size(_minTarget, _minTarget),
                ),
                child: Text(loc.mapWizardBack),
              ),
              const Spacer(),
              FilledButton(
                onPressed: state.canSave && !saving
                    ? () => saveBoundaryWithConfirm(context, bloc, state)
                    : null,
                style: FilledButton.styleFrom(
                  minimumSize: const Size(_minTarget, _minTarget),
                ),
                child: saving
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(loc.boundaryEditorSave),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
