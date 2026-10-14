import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../data/console_repository.dart';
import '../../domain/console_entities.dart';

/// Load state shared by the three small console pages.
class LoadState<T> extends Equatable {
  const LoadState({this.items = const [], this.loading = true, this.loadFailed = false, this.actionError, this.busyId});

  final List<T> items;
  final bool loading;

  /// The list itself could not be loaded (retry shown).
  final bool loadFailed;

  /// A row action failed; the page maps it by code.
  final Object? actionError;
  final int? busyId;

  LoadState<T> copyWith({
    List<T>? items,
    bool? loading,
    bool? loadFailed,
    Object? Function()? actionError,
    int? Function()? busyId,
  }) =>
      LoadState<T>(
        items: items ?? this.items,
        loading: loading ?? this.loading,
        loadFailed: loadFailed ?? this.loadFailed,
        actionError: actionError == null ? this.actionError : actionError(),
        busyId: busyId == null ? this.busyId : busyId(),
      );

  @override
  List<Object?> get props => [items, loading, loadFailed, actionError, busyId];
}

/// "ফোন নম্বর ঠিক করুন": one PUT per row.
class PhoneFixesCubit extends Cubit<LoadState<PhoneFix>> {
  PhoneFixesCubit({required PhoneFixRepository repository})
      : _repository = repository,
        super(const LoadState());

  final PhoneFixRepository _repository;

  Future<void> load() async {
    emit(state.copyWith(loading: true, loadFailed: false));
    try {
      emit(state.copyWith(items: await _repository.list(), loading: false));
    } catch (_) {
      emit(state.copyWith(loading: false, loadFailed: true));
    }
  }

  /// True when the number was saved and the row is gone.
  Future<bool> resolve(PhoneFix fix, String mobile) async {
    if (state.busyId != null) return false;
    emit(state.copyWith(busyId: () => fix.id, actionError: () => null));
    try {
      await _repository.resolve(fix.id, mobile);
      emit(state.copyWith(busyId: () => null, items: [for (final f in state.items) if (f.id != fix.id) f]));
      return true;
    } catch (e) {
      emit(state.copyWith(busyId: () => null, actionError: () => e));
      return false;
    }
  }
}

/// Membership application queue (status filter + search + review actions).
class MembershipApplicationsCubit extends Cubit<LoadState<MembershipApplication>> {
  MembershipApplicationsCubit({required MembershipApplicationRepository repository})
      : _repository = repository,
        super(const LoadState());

  final MembershipApplicationRepository _repository;

  /// null = all.
  String? status;
  String search = '';

  Future<void> load() async {
    emit(state.copyWith(loading: true, loadFailed: false));
    try {
      final rows = await _repository.list(status: status, search: search.length >= 2 ? search : null);
      emit(state.copyWith(items: rows, loading: false));
    } catch (_) {
      emit(state.copyWith(loading: false, loadFailed: true));
    }
  }

  Future<void> setStatus(String? value) {
    status = value;
    return load();
  }

  Future<void> setSearch(String value) {
    search = value.trim();
    return load();
  }

  Future<void> startReview(MembershipApplication a) => _act(a, () => _repository.startReview(a.id));

  Future<void> approve(MembershipApplication a) => _act(a, () => _repository.approve(a.id));

  Future<void> reject(MembershipApplication a, String reason) => _act(a, () => _repository.reject(a.id, reason));

  Future<void> _act(MembershipApplication a, Future<void> Function() run) async {
    if (state.busyId != null) return;
    emit(state.copyWith(busyId: () => a.id, actionError: () => null));
    try {
      await run();
      emit(state.copyWith(busyId: () => null));
    } catch (e) {
      emit(state.copyWith(busyId: () => null, actionError: () => e));
    }
    await load();
  }
}

/// Read-only cache stats.
class CacheStatsCubit extends Cubit<({CacheStats? stats, bool loading, bool failed})> {
  CacheStatsCubit({required CacheStatsRepository repository})
      : _repository = repository,
        super((stats: null, loading: true, failed: false));

  final CacheStatsRepository _repository;

  Future<void> load() async {
    emit((stats: state.stats, loading: true, failed: false));
    try {
      emit((stats: await _repository.stats(), loading: false, failed: false));
    } catch (_) {
      emit((stats: null, loading: false, failed: true));
    }
  }
}
