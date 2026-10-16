import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../data/cost_share_payment_repository.dart';
import '../../domain/cost_share_verification_entities.dart';

class CostShareVerificationState extends Equatable {
  const CostShareVerificationState({
    this.statusFilter = 'pending',
    this.rows = const [],
    this.loading = true,
    this.error,
    this.busyId,
  });

  final String statusFilter;
  final List<AdminCostSharePayment> rows;
  final bool loading;
  final Object? error;
  final int? busyId;

  CostShareVerificationState copyWith({
    List<AdminCostSharePayment>? rows,
    bool? loading,
    Object? Function()? error,
    int? Function()? busyId,
  }) =>
      CostShareVerificationState(
        statusFilter: statusFilter,
        rows: rows ?? this.rows,
        loading: loading ?? this.loading,
        error: error == null ? this.error : error(),
        busyId: busyId == null ? this.busyId : busyId(),
      );

  @override
  List<Object?> get props => [statusFilter, rows, loading, error, busyId];
}

/// The "খরচ ভাগ" tab of payment verifications.
class CostShareVerificationCubit extends Cubit<CostShareVerificationState> {
  CostShareVerificationCubit({
    required CostSharePaymentRepository repository,
    this.onReviewed,
  })  : _repository = repository,
        super(const CostShareVerificationState());

  final CostSharePaymentRepository _repository;

  /// Called after each successful approve / reject (refreshes counts).
  final void Function()? onReviewed;

  Future<void> load() async {
    emit(state.copyWith(loading: true, error: () => null));
    try {
      final rows = await _repository.list(status: state.statusFilter);
      emit(state.copyWith(rows: rows, loading: false));
    } on Exception catch (e) {
      emit(state.copyWith(loading: false, error: () => e));
    }
  }

  Future<void> setStatus(String status) async {
    emit(CostShareVerificationState(statusFilter: status));
    await load();
  }

  Future<void> approve(AdminCostSharePayment row) => _decide(row, () => _repository.approve(row.id));

  Future<void> reject(AdminCostSharePayment row, String reason) =>
      _decide(row, () => _repository.reject(row.id, reason));

  Future<void> _decide(AdminCostSharePayment row, Future<Object?> Function() run) async {
    emit(state.copyWith(busyId: () => row.id, error: () => null));
    try {
      await run();
      emit(state.copyWith(
        busyId: () => null,
        rows: [for (final r in state.rows) if (r.id != row.id) r],
      ));
      onReviewed?.call();
    } on Exception catch (e) {
      emit(state.copyWith(busyId: () => null, error: () => e));
      await load();
    }
  }
}
