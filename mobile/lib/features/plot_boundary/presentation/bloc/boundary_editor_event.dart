part of 'boundary_editor_bloc.dart';

sealed class BoundaryEditorEvent extends Equatable {
  const BoundaryEditorEvent();
  @override
  List<Object?> get props => const [];
}

/// Loads the property picker inputs; optionally starts editing a saved
/// boundary (its vertices are preloaded).
final class EditorStarted extends BoundaryEditorEvent {
  const EditorStarted({this.editing, this.propertyId});
  final PlotBoundary? editing;

  /// Property to preselect when drawing a new boundary (from the draw panel).
  final String? propertyId;
  @override
  List<Object?> get props => [editing, propertyId];
}

/// Preloads the vertices of an existing boundary for editing.
final class EditorExistingLoaded extends BoundaryEditorEvent {
  const EditorExistingLoaded(this.boundary);
  final PlotBoundary boundary;
  @override
  List<Object?> get props => [boundary];
}

/// Tap on the map adds a vertex at [point].
final class EditorVertexAdded extends BoundaryEditorEvent {
  const EditorVertexAdded(this.point);
  final LatLng point;
  @override
  List<Object?> get props => [point];
}

/// Marks the start of a vertex drag; pushes a single undo entry for the
/// whole drag (move events themselves do not grow the undo stack). Only the
/// map_wizard editor sends it; the legacy editor logs every move.
final class EditorVertexMoveStarted extends BoundaryEditorEvent {
  const EditorVertexMoveStarted(this.index);
  final int index;
  @override
  List<Object?> get props => [index];
}

final class EditorVertexMoved extends BoundaryEditorEvent {
  const EditorVertexMoved(this.index, this.point);
  final int index;
  final LatLng point;
  @override
  List<Object?> get props => [index, point];
}

final class EditorVertexRemoved extends BoundaryEditorEvent {
  const EditorVertexRemoved(this.index);
  final int index;
  @override
  List<Object?> get props => [index];
}

final class EditorUndoPressed extends BoundaryEditorEvent {
  const EditorUndoPressed();
}

/// Re-applies what the last undo took back (map_wizard). Any new edit drops
/// the redo history.
final class EditorRedoPressed extends BoundaryEditorEvent {
  const EditorRedoPressed();
}

/// The vertex drag finished, so the next move starts a new undo step
/// (map_wizard).
final class EditorVertexMoveEnded extends BoundaryEditorEvent {
  const EditorVertexMoveEnded();
}

/// "দাগ থেকে শুরু করুন": the chosen RS plot's ring becomes the editable shape
/// (map_wizard). A closing vertex is dropped; rings under 3 points are ignored.
final class EditorPrefilledFromDag extends BoundaryEditorEvent {
  const EditorPrefilledFromDag(this.ring);
  final List<LatLng> ring;
  @override
  List<Object?> get props => [ring];
}

/// Moves the wizard between "find" / "adjust" / "submit" (map_wizard).
final class EditorStepChanged extends BoundaryEditorEvent {
  const EditorStepChanged(this.step);
  final EditorStep step;
  @override
  List<Object?> get props => [step];
}

final class EditorCleared extends BoundaryEditorEvent {
  const EditorCleared();
}

final class EditorPropertyChanged extends BoundaryEditorEvent {
  const EditorPropertyChanged(this.propertyId);
  final String propertyId;
  @override
  List<Object?> get props => [propertyId];
}

/// POST when drawing new, PUT when editing; result is pending_review.
final class EditorSaveRequested extends BoundaryEditorEvent {
  const EditorSaveRequested();
}
