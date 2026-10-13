import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../data/payments_repository.dart';
import '../../domain/merged_payment_entities.dart';

enum PaymentsStatus { loading, loaded, failure }

const int paymentsPageSize = 20;

class PaymentsState extends Equatable {
  const PaymentsState({
    this.status = PaymentsStatus.loading,
    this.summary,
    this.items = const [],
    this.total = 0,
    this.page = 1,
    this.kind,
    this.itemStatus,
    this.loadingMore = false,
    this.historyError,
    this.error,
  });

  final PaymentsStatus status;
  final PaymentSummary? summary;
  final List<PaymentHistoryItem> items;
  final int total;
  final int page;
  final PaymentKind? kind;
  final PaymentItemStatus? itemStatus;
  final bool loadingMore;

  /// History failed but the summary is fine.
  final Object? historyError;
  final Object? error;

  bool get hasMore => items.length < total;

  PaymentsState copyWith({
    PaymentsStatus? status,
    PaymentSummary? summary,
    List<PaymentHistoryItem>? items,
    int? total,
    int? page,
    PaymentKind? kind,
    bool clearKind = false,
    PaymentItemStatus? itemStatus,
    bool clearItemStatus = false,
    bool? loadingMore,
    Object? historyError,
    bool clearHistoryError = false,
    Object? error,
    bool clearError = false,
  }) =>
      PaymentsState(
        status: status ?? this.status,
        summary: summary ?? this.summary,
        items: items ?? this.items,
        total: total ?? this.total,
        page: page ?? this.page,
        kind: clearKind ? null : (kind ?? this.kind),
        itemStatus: clearItemStatus ? null : (itemStatus ?? this.itemStatus),
        loadingMore: loadingMore ?? this.loadingMore,
        historyError: clearHistoryError ? null : (historyError ?? this.historyError),
        error: clearError ? null : (error ?? this.error),
      );

  @override
  List<Object?> get props => [status, summary, items, total, page, kind, itemStatus, loadingMore, historyError, error];
}

/// Payments page: summary + filtered, paginated merged history.
class PaymentsCubit extends Cubit<PaymentsState> {
  PaymentsCubit({
    required PaymentsRepository repository,
    PaymentKind? initialKind,
    PaymentItemStatus? initialStatus,
  })  : _repository = repository,
        super(PaymentsState(kind: initialKind, itemStatus: initialStatus));

  final PaymentsRepository _repository;

  /// Loads summary and history together (first load, retry, after paying).
  Future<void> load() async {
    emit(state.copyWith(status: PaymentsStatus.loading, clearError: true, clearHistoryError: true));
    try {
      final results = await Future.wait([
        _repository.summary(),
        _repository.history(kind: state.kind, status: state.itemStatus, page: 1, pageSize: paymentsPageSize),
      ]);
      final page = results[1] as PaymentHistoryPage;
      emit(state.copyWith(
        status: PaymentsStatus.loaded,
        summary: results[0] as PaymentSummary,
        items: page.items,
        total: page.total,
        page: 1,
      ));
    } catch (e) {
      emit(state.copyWith(status: PaymentsStatus.failure, error: e));
    }
  }

  Future<void> setKind(PaymentKind? kind) => _reloadHistory(kind: kind, clearKind: kind == null);

  Future<void> setStatus(PaymentItemStatus? status) =>
      _reloadHistory(itemStatus: status, clearItemStatus: status == null);

  Future<void> _reloadHistory({
    PaymentKind? kind,
    bool clearKind = false,
    PaymentItemStatus? itemStatus,
    bool clearItemStatus = false,
  }) async {
    final next = state.copyWith(
      kind: kind,
      clearKind: clearKind,
      itemStatus: itemStatus,
      clearItemStatus: clearItemStatus,
      loadingMore: false,
      clearHistoryError: true,
    );
    emit(next);
    try {
      final page = await _repository.history(
          kind: next.kind, status: next.itemStatus, page: 1, pageSize: paymentsPageSize);
      emit(state.copyWith(items: page.items, total: page.total, page: 1));
    } catch (e) {
      emit(state.copyWith(historyError: e));
    }
  }

  Future<void> loadMore() async {
    if (state.loadingMore || !state.hasMore) return;
    emit(state.copyWith(loadingMore: true, clearHistoryError: true));
    try {
      final next = state.page + 1;
      final page = await _repository.history(
          kind: state.kind, status: state.itemStatus, page: next, pageSize: paymentsPageSize);
      emit(state.copyWith(
        items: [...state.items, ...page.items],
        total: page.total,
        page: next,
        loadingMore: false,
      ));
    } catch (e) {
      emit(state.copyWith(loadingMore: false, historyError: e));
    }
  }
}
