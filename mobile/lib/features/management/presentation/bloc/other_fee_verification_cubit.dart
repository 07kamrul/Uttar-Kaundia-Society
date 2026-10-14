import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/network/api_exception.dart';
import '../../data/other_fee_verification_repository.dart';
import '../../domain/bulk_entities.dart';
import '../../domain/other_fee_verification_entities.dart';

class OtherFeeVerificationState extends Equatable {
  const OtherFeeVerificationState({
    this.statusFilter = 'pending',
    this.rows = const [],
    this.loading = true,
    this.error,
    this.busyKey,
    this.selected = const {},
    this.bulkBusy = false,
    this.bulkResult,
    this.stale = false,
  });

  final String statusFilter;
  final List<AdminOtherFeePayment> rows;
  final bool loading;
  final Object? error;
  final String? busyKey;
  final Set<String> selected;
  final bool bulkBusy;
  final BulkApproveResult? bulkResult;
  final bool stale;

  List<AdminOtherFeePayment> get selectedRows => [for (final r in rows) if (selected.contains(r.key)) r];

  String get selectedTotal => otherFeeTotalString(selectedRows);

  OtherFeeVerificationState copyWith({
    String? statusFilter,
    List<AdminOtherFeePayment>? rows,
    bool? loading,
    Object? Function()? error,
    String? Function()? busyKey,
    Set<String>? selected,
    bool? bulkBusy,
    BulkApproveResult? Function()? bulkResult,
    bool? stale,
  }) =>
      OtherFeeVerificationState(
        statusFilter: statusFilter ?? this.statusFilter,
        rows: rows ?? this.rows,
        loading: loading ?? this.loading,
        error: error == null ? this.error : error(),
        busyKey: busyKey == null ? this.busyKey : busyKey(),
        selected: selected ?? this.selected,
        bulkBusy: bulkBusy ?? this.bulkBusy,
        bulkResult: bulkResult == null ? this.bulkResult : bulkResult(),
        stale: stale ?? this.stale,
      );

  @override
  List<Object?> get props => [statusFilter, rows, loading, error, busyKey, selected, bulkBusy, bulkResult, stale];
}

/// The "অন্যান্য ফি" tab of payment verifications.
class OtherFeeVerificationCubit extends Cubit<OtherFeeVerificationState> {
  OtherFeeVerificationCubit({required OtherFeeVerificationRepository repository})
      : _repository = repository,
        super(const OtherFeeVerificationState());

  final OtherFeeVerificationRepository _repository;

  Future<void> load() async {
    emit(state.copyWith(loading: true, error: () => null));
    try {
      final rows = await _repository.list(status: state.statusFilter);
      emit(state.copyWith(rows: rows, loading: false));
    } catch (e) {
      emit(state.copyWith(loading: false, error: () => e));
    }
  }

  Future<void> setStatus(String status) async {
    emit(OtherFeeVerificationState(statusFilter: status));
    await load();
  }

  void toggle(String key) {
    if (!state.rows.any((r) => r.key == key && r.isPending)) return;
    final next = {...state.selected};
    if (!next.remove(key)) next.add(key);
    emit(state.copyWith(selected: next, bulkResult: () => null, stale: false));
  }

  Future<void> approve(AdminOtherFeePayment row) => _decide(row, () => _repository.approve(row.kind, row.id));

  Future<void> reject(AdminOtherFeePayment row, String reason) =>
      _decide(row, () => _repository.reject(row.kind, row.id, reason));

  Future<void> _decide(AdminOtherFeePayment row, Future<void> Function() run) async {
    emit(state.copyWith(busyKey: () => row.key, error: () => null));
    try {
      await run();
      emit(state.copyWith(
        busyKey: () => null,
        rows: [for (final r in state.rows) if (r.key != row.key) r],
        selected: {...state.selected}..remove(row.key),
      ));
    } catch (e) {
      emit(state.copyWith(busyKey: () => null, error: () => e));
      await load();
    }
  }

  Future<void> bulkApprove() async {
    final chosen = state.selectedRows;
    if (chosen.isEmpty || state.bulkBusy) return;
    emit(state.copyWith(bulkBusy: true, error: () => null, bulkResult: () => null, stale: false));
    try {
      final result = await _repository.bulkApprove(
        chosen,
        expectedCount: chosen.length,
        expectedTotal: otherFeeTotalString(chosen),
      );
      final done = {for (final a in result.approved) a.idRef ?? 'fee:${a.id}'};
      emit(state.copyWith(
        bulkBusy: false,
        rows: [for (final r in state.rows) if (!done.contains(r.key)) r],
        selected: state.selected.difference(done),
        bulkResult: () => result,
      ));
    } on ApiException catch (err) {
      if (err.errorCode == 'BULK_SELECTION_STALE') {
        emit(state.copyWith(bulkBusy: false, selected: const {}, stale: true));
        await load();
      } else {
        emit(state.copyWith(bulkBusy: false, error: () => err));
      }
    } catch (err) {
      emit(state.copyWith(bulkBusy: false, error: () => err));
    }
  }
}
