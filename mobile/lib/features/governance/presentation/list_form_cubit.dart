import 'package:flutter_bloc/flutter_bloc.dart';

/// State shared by the governance pages: a loaded [data] value plus the status
/// of the last form action ([busy], [actionError], [doneCount]).
class ListFormState<T> {
  const ListFormState({
    this.loading = true,
    this.data,
    this.loadError,
    this.busy = false,
    this.actionError,
    this.doneCount = 0,
  });

  final bool loading;
  final T? data;
  final Object? loadError;
  final bool busy;
  final Object? actionError;

  /// Number of actions that succeeded so far; pages show a toast when it grows.
  final int doneCount;

  ListFormState<T> copyWith({
    bool? loading,
    T? data,
    Object? loadError,
    bool clearLoadError = false,
    bool? busy,
    Object? actionError,
    bool clearActionError = false,
    int? doneCount,
  }) =>
      ListFormState<T>(
        loading: loading ?? this.loading,
        data: data ?? this.data,
        loadError: clearLoadError ? null : (loadError ?? this.loadError),
        busy: busy ?? this.busy,
        actionError: clearActionError ? null : (actionError ?? this.actionError),
        doneCount: doneCount ?? this.doneCount,
      );
}

/// Loads one page of data and runs form actions against it. Subclasses supply
/// [fetch] and expose typed action methods that call [run].
abstract class ListFormCubit<T> extends Cubit<ListFormState<T>> {
  ListFormCubit() : super(ListFormState<T>());

  Future<T> fetch();

  Future<void> load() async {
    emit(state.copyWith(loading: true, clearLoadError: true));
    try {
      final data = await fetch();
      if (isClosed) return;
      emit(state.copyWith(loading: false, data: data));
    } catch (e) {
      if (isClosed) return;
      emit(state.copyWith(loading: false, loadError: e));
    }
  }

  /// Runs [action]; on success reloads the data. Returns false when another
  /// action is still running or the action failed ([ListFormState.actionError]).
  Future<bool> run(Future<void> Function() action, {bool reload = true}) async {
    if (state.busy) return false;
    emit(state.copyWith(busy: true, clearActionError: true));
    try {
      await action();
    } catch (e) {
      if (!isClosed) emit(state.copyWith(busy: false, actionError: e));
      return false;
    }
    if (isClosed) return true;
    var next = state.copyWith(busy: false, doneCount: state.doneCount + 1);
    if (reload) {
      try {
        next = next.copyWith(data: await fetch(), clearLoadError: true);
      } catch (_) {
        // The action went through; a failed refresh keeps the old data and
        // the pull-to-refresh / retry path still works.
      }
    }
    if (!isClosed) emit(next);
    return true;
  }
}
