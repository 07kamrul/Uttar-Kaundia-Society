import 'dart:async';

import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/network/api_exception.dart';
import '../../data/admin_repository.dart';
import '../../domain/bulk_entities.dart';
import '../../domain/finance_entities.dart';

part 'payment_verifications_event.dart';
part 'payment_verifications_state.dart';

class PaymentVerificationsBloc
    extends Bloc<PaymentVerificationsEvent, PaymentVerificationsState> {
  PaymentVerificationsBloc({required InstallmentPaymentRepository repository})
      : _repository = repository,
        super(const PaymentVerificationsState()) {
    on<PaymentVerificationsLoadRequested>((e, emit) => _load(emit));
    on<PaymentVerificationsStatusFilterChanged>((e, emit) async {
      emit(PaymentVerificationsState(statusFilter: e.status));
      await _load(emit);
    });
    on<PaymentVerificationsToggled>(_onToggled);
    on<PaymentVerificationsSelectionCleared>((e, emit) => emit(state.copyWith(
        selected: const {}, bulkResult: () => null, stale: false)));
    on<PaymentVerificationsBulkApproveRequested>(_onBulkApprove);
    on<PaymentVerificationsApproved>((e, emit) =>
        _decide(emit, e.payment, () => _repository.approve(e.payment.id)));
    on<PaymentVerificationsRejected>((e, emit) => _decide(
        emit, e.payment, () => _repository.reject(e.payment.id, e.reason)));
  }

  final InstallmentPaymentRepository _repository;

  void _onToggled(
    PaymentVerificationsToggled e,
    Emitter<PaymentVerificationsState> emit,
  ) {
    final known = state.payments.any((p) => p.id == e.id && p.status == 'pending');
    if (!known) return;
    final next = {...state.selected};
    if (!next.remove(e.id)) next.add(e.id);
    emit(state.copyWith(
        selected: next, bulkResult: () => null, stale: false));
  }

  Future<void> _onBulkApprove(
    PaymentVerificationsBulkApproveRequested e,
    Emitter<PaymentVerificationsState> emit,
  ) async {
    final chosen = state.selectedPayments;
    if (chosen.isEmpty || state.bulkBusy) return;
    emit(state.copyWith(
        bulkBusy: true, error: () => null, bulkResult: () => null, stale: false));
    try {
      final result = await _repository.bulkApprove(
        [for (final p in chosen) p.id],
        expectedCount: chosen.length,
        expectedTotal: bulkTotalString(chosen),
      );
      final done = result.approvedIds.toSet();
      emit(state.copyWith(
        bulkBusy: false,
        payments: [for (final p in state.payments) if (!done.contains(p.id)) p],
        selected: state.selected.difference(done),
        bulkResult: () => result,
      ));
    } on ApiException catch (err) {
      if (err.errorCode == 'BULK_SELECTION_STALE') {
        emit(state.copyWith(bulkBusy: false, selected: const {}, stale: true));
        await _load(emit);
      } else {
        emit(state.copyWith(bulkBusy: false, error: () => err));
      }
    } catch (err) {
      emit(state.copyWith(bulkBusy: false, error: () => err));
    }
  }

  Future<void> _load(Emitter<PaymentVerificationsState> emit) async {
    emit(state.copyWith(loading: true, error: () => null));
    try {
      final payments =
          await _repository.listForAdmin(status: state.statusFilter);
      emit(state.copyWith(payments: payments, loading: false));
    } catch (e) {
      emit(state.copyWith(loading: false, error: () => e));
    }
  }

  Future<void> _decide(
    Emitter<PaymentVerificationsState> emit,
    AdminInstallmentPayment payment,
    Future<Object?> Function() run,
  ) async {
    emit(state.copyWith(busyId: () => payment.id, error: () => null));
    try {
      await run();
      emit(state.copyWith(
        busyId: () => null,
        payments: state.payments.where((p) => p.id != payment.id).toList(),
      ));
    } catch (e) {
      emit(state.copyWith(busyId: () => null, error: () => e));
      await _load(emit);
    }
  }
}
