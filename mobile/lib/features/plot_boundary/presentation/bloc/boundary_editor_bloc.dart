import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:latlong2/latlong.dart';

import '../../../../core/di/injector.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/network/api_exception.dart';
import '../../data/plot_boundary_repository_impl.dart';
import '../../domain/boundary_validation.dart';
import '../../domain/geo.dart';
import '../../domain/plot_boundary_entities.dart';
import '../../domain/plot_boundary_failure.dart';
import '../../domain/plot_boundary_repository.dart';

part 'boundary_editor_event.dart';
part 'boundary_editor_state.dart';

enum EditorStatus { loading, ready, saving, saved, failure }

/// The three screens of the map_wizard editor ("ধাপ n / ৩").
enum EditorStep { find, adjust, submit }

/// Undo/redo keeps at most this many snapshots in the wizard.
const int kEditorHistoryLimit = 50;

class BoundaryEditorBloc
    extends Bloc<BoundaryEditorEvent, BoundaryEditorState> {
  BoundaryEditorBloc({
    GetMyProperties? getMyProperties,
    GetMyBoundaries? getMyBoundaries,
    SaveBoundary? saveBoundary,
    SocietyBbox? society,
    bool wizard = false,
  })  : _injectedProperties = getMyProperties,
        _injectedBoundaries = getMyBoundaries,
        _injectedSave = saveBoundary,
        _wizard = wizard,
        super(BoundaryEditorState(
          society: society,
          step: wizard ? EditorStep.find : EditorStep.adjust,
        )) {
    on<EditorStarted>(_onStarted);
    on<EditorVertexAdded>(_onVertexAdded);
    on<EditorVertexMoved>(_onVertexMoved);
    on<EditorVertexMoveStarted>(_onVertexMoveStarted);
    on<EditorVertexMoveEnded>((_, __) => _dragging = false);
    on<EditorVertexRemoved>(_onVertexRemoved);
    on<EditorUndoPressed>(_onUndo);
    on<EditorRedoPressed>(_onRedo);
    on<EditorPrefilledFromDag>(_onPrefilled);
    on<EditorStepChanged>((e, emit) => emit(state.copyWith(step: e.step)));
    on<EditorCleared>(_onClear);
    on<EditorPropertyChanged>(_onPropertyChanged);
    on<EditorExistingLoaded>(_onExistingLoaded);
    on<EditorSaveRequested>(_onSave);
  }

  final GetMyProperties? _injectedProperties;
  final GetMyBoundaries? _injectedBoundaries;
  final SaveBoundary? _injectedSave;

  /// map_wizard: three steps, bounded history, one undo step per drag.
  final bool _wizard;
  bool _dragging = false;

  /// Undo/redo cap; null (legacy editor) keeps everything.
  int? get _historyLimit => _wizard ? kEditorHistoryLimit : null;

  List<List<LatLng>> _pushed(List<List<LatLng>> stack, List<LatLng> snapshot) {
    final next = [...stack, snapshot];
    final limit = _historyLimit;
    return limit != null && next.length > limit
        ? next.sublist(next.length - limit)
        : next;
  }

  static bool _hasAnyDag(OwnProperty p) =>
      (p.rsDag ?? '').trim().isNotEmpty || (p.csDag ?? '').trim().isNotEmpty;

  // Lazily resolved DI defaults so tests can inject without a GetIt setup.
  late final GetMyProperties _getMyProperties = _injectedProperties ??
      GetMyProperties(PlotBoundaryRepositoryImpl(apiClient: sl<ApiClient>()));
  late final GetMyBoundaries _getMyBoundaries = _injectedBoundaries ??
      GetMyBoundaries(PlotBoundaryRepositoryImpl(apiClient: sl<ApiClient>()));
  late final SaveBoundary _saveBoundary = _injectedSave ??
      SaveBoundary(PlotBoundaryRepositoryImpl(apiClient: sl<ApiClient>()));

  Future<void> _onStarted(
    EditorStarted event,
    Emitter<BoundaryEditorState> emit,
  ) async {
    emit(state.copyWith(status: EditorStatus.loading, clearFailure: true));
    try {
      final results =
          await Future.wait([_getMyProperties(), _getMyBoundaries()]);
      final properties = results[0] as List<OwnProperty>;
      final boundaries = results[1] as List<PlotBoundary>;
      final withBoundary = boundaries.map((b) => b.propertyId).toSet();
      final available = [
        for (final p in properties)
          if (!withBoundary.contains(p.propertyId)) p,
      ];
      String? selected;
      if (event.editing != null) {
        selected = event.editing!.propertyId;
      } else if (available.any((p) => p.propertyId == event.propertyId)) {
        selected = event.propertyId;
      } else if (available.isNotEmpty) {
        selected = available.first.propertyId;
      }
      final selectedProperty = [
        for (final p in properties)
          if (p.propertyId == selected) p,
      ].firstOrNull;
      // A plot with no dag number cannot be looked up: draw it freehand.
      final skipFind = event.editing != null ||
          (selectedProperty != null && !_hasAnyDag(selectedProperty));
      emit(state.copyWith(
        status: EditorStatus.ready,
        properties: properties,
        availableProperties: available,
        boundaries: boundaries,
        selectedPropertyId: selected,
        step: _wizard && skipFind ? EditorStep.adjust : null,
        clearFailure: true,
      ));
      if (event.editing != null) {
        add(EditorExistingLoaded(event.editing!));
      }
    } on ApiException catch (e) {
      emit(state.copyWith(
        status: EditorStatus.failure,
        failureKind: plotBoundaryFailureKindOf(e),
      ));
    } on FormatException {
      emit(state.copyWith(
        status: EditorStatus.failure,
        failureKind: PlotBoundaryFailureKind.other,
      ));
    }
  }

  void _onExistingLoaded(
    EditorExistingLoaded event,
    Emitter<BoundaryEditorState> emit,
  ) {
    final b = event.boundary;
    emit(state.copyWith(
      vertices: b.points,
      editingId: b.id,
      selectedPropertyId: b.propertyId,
      clearVertices: false,
      editingHasPending: b.hasPending,
    ));
  }

  void _onVertexAdded(
    EditorVertexAdded event,
    Emitter<BoundaryEditorState> emit,
  ) {
    if (state.vertices.length >= BoundaryValidation.maxVertices) return;
    emit(state.copyWith(
      vertices: [...state.vertices, event.point],
      undoStack: _pushed(state.undoStack, state.vertices),
      redoStack: const [],
      clearFailure: true,
    ));
  }

  void _onVertexMoveStarted(
    EditorVertexMoveStarted event,
    Emitter<BoundaryEditorState> emit,
  ) {
    if (event.index < 0 || event.index >= state.vertices.length) return;
    _dragging = true;
    emit(state.copyWith(
      undoStack: _pushed(state.undoStack, state.vertices),
      redoStack: const [],
    ));
  }

  void _onVertexMoved(
    EditorVertexMoved event,
    Emitter<BoundaryEditorState> emit,
  ) {
    if (event.index < 0 || event.index >= state.vertices.length) return;
    final next = [...state.vertices];
    next[event.index] = event.point;
    emit(state.copyWith(
      vertices: next,
      undoStack: _dragging
          ? state.undoStack
          : _pushed(state.undoStack, state.vertices),
      redoStack: const [],
    ));
  }

  void _onVertexRemoved(
    EditorVertexRemoved event,
    Emitter<BoundaryEditorState> emit,
  ) {
    if (event.index < 0 || event.index >= state.vertices.length) return;
    final next = [...state.vertices]..removeAt(event.index);
    emit(state.copyWith(
      vertices: next,
      undoStack: _pushed(state.undoStack, state.vertices),
      redoStack: const [],
    ));
  }

  void _onUndo(
    EditorUndoPressed event,
    Emitter<BoundaryEditorState> emit,
  ) {
    final stack = [...state.undoStack];
    if (stack.isEmpty) return;
    emit(state.copyWith(
      vertices: stack.removeLast(),
      undoStack: stack,
      redoStack: _pushed(state.redoStack, state.vertices),
    ));
  }

  void _onRedo(
    EditorRedoPressed event,
    Emitter<BoundaryEditorState> emit,
  ) {
    final stack = [...state.redoStack];
    if (stack.isEmpty) return;
    emit(state.copyWith(
      vertices: stack.removeLast(),
      redoStack: stack,
      undoStack: _pushed(state.undoStack, state.vertices),
    ));
  }

  void _onPrefilled(
    EditorPrefilledFromDag event,
    Emitter<BoundaryEditorState> emit,
  ) {
    final ring = [...event.ring];
    if (ring.length > 1 && ring.first == ring.last) ring.removeLast();
    if (ring.length < 3) return;
    emit(state.copyWith(
      vertices: ring,
      undoStack: _pushed(state.undoStack, state.vertices),
      redoStack: const [],
      clearFailure: true,
    ));
  }

  void _onClear(
    EditorCleared event,
    Emitter<BoundaryEditorState> emit,
  ) {
    if (state.vertices.isEmpty) return;
    emit(state.copyWith(
      vertices: const [],
      clearVertices: true,
      undoStack: _pushed(state.undoStack, state.vertices),
      redoStack: const [],
    ));
  }

  void _onPropertyChanged(
    EditorPropertyChanged event,
    Emitter<BoundaryEditorState> emit,
  ) {
    emit(state.copyWith(selectedPropertyId: event.propertyId));
  }

  Future<void> _onSave(
    EditorSaveRequested event,
    Emitter<BoundaryEditorState> emit,
  ) async {
    final propertyId = state.selectedPropertyId;
    if (propertyId == null || !state.validation.canSave) return;
    emit(state.copyWith(status: EditorStatus.saving, clearFailure: true));
    try {
      final saved = await _saveBoundary(
        id: state.editingId,
        propertyId: propertyId,
        points: state.vertices,
      );
      emit(state.copyWith(
        status: EditorStatus.saved,
        saved: saved,
        editingId: saved.id,
      ));
    } on ApiException catch (e) {
      emit(state.copyWith(
        status: EditorStatus.failure,
        failureKind: plotBoundaryFailureKindOf(e),
      ));
    } on FormatException {
      emit(state.copyWith(
        status: EditorStatus.failure,
        failureKind: PlotBoundaryFailureKind.other,
      ));
    }
  }
}
