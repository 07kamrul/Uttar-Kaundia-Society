import 'package:flutter/material.dart';

import '../../../../l10n/app_localizations.dart';
import '../../domain/boundary_validation.dart';
import '../../domain/plot_boundary_failure.dart';
import '../bloc/boundary_editor_bloc.dart';
import 'draw_panel_sheet.dart' show confirmAction;

/// Plain-language text for a client-side validation problem.
String boundaryErrorLabel(BoundaryError error, AppLocalizations loc) =>
    switch (error) {
      BoundaryError.tooFewPoints => loc.boundaryErrorTooFewPoints,
      BoundaryError.selfIntersecting => loc.boundaryErrorSelfIntersecting,
      BoundaryError.outsideSociety => loc.boundaryErrorOutsideSociety,
      BoundaryError.zeroArea => loc.boundaryErrorZeroArea,
      BoundaryError.tooManyVertices => loc.boundaryErrorTooManyVertices,
    };

/// Plain-language text for a failed load or save.
String boundaryFailureMessage(
  PlotBoundaryFailureKind? kind,
  AppLocalizations loc,
) =>
    switch (kind) {
      PlotBoundaryFailureKind.network => loc.commonNetworkError,
      PlotBoundaryFailureKind.selfIntersecting =>
        loc.boundaryErrorSelfIntersecting,
      PlotBoundaryFailureKind.outsideSociety => loc.boundaryErrorOutsideSociety,
      PlotBoundaryFailureKind.zeroArea => loc.boundaryErrorZeroArea,
      PlotBoundaryFailureKind.tooManyVertices =>
        loc.boundaryErrorTooManyVertices,
      PlotBoundaryFailureKind.invalidGeometry =>
        loc.boundaryErrorInvalidGeometry,
      PlotBoundaryFailureKind.notYourProperty =>
        loc.boundaryErrorNotYourProperty,
      PlotBoundaryFailureKind.boundaryExists => loc.boundaryErrorBoundaryExists,
      PlotBoundaryFailureKind.rateLimited => loc.boundaryErrorRateLimited,
      PlotBoundaryFailureKind.notApproved => loc.boundaryErrorNotApproved,
      PlotBoundaryFailureKind.other || null => loc.boundaryErrorGeneric,
    };

/// Saving over a pending review replaces it, so ask first; then submit.
Future<void> saveBoundaryWithConfirm(
  BuildContext context,
  BoundaryEditorBloc bloc,
  BoundaryEditorState state,
) async {
  if (state.editingHasPending) {
    final loc = AppLocalizations.of(context);
    final confirmed = await confirmAction(
      context,
      title: loc.plotMapDrawReplaceTitle,
      message: loc.plotMapDrawReplaceMessage,
      confirmLabel: loc.commonSave,
    );
    if (!confirmed) return;
  }
  bloc.add(const EditorSaveRequested());
}
