part of 'payment_verifications_bloc.dart';


// ----- Installment payment verification queue -----

class PaymentVerificationsState extends Equatable {
  const PaymentVerificationsState({
    this.statusFilter = 'pending',
    this.payments = const [],
    this.loading = true,
    this.error,
    this.busyId,
    this.selected = const {},
    this.bulkBusy = false,
    this.bulkResult,
    this.stale = false,
  });

  /// Ids ticked for the bulk approve (pending tab only).
  final Set<int> selected;
  final bool bulkBusy;

  /// Outcome of the last bulk approve; cleared by the next change.
  final BulkApproveResult? bulkResult;

  /// The last bulk approve was refused because the list had changed.
  final bool stale;

  List<AdminInstallmentPayment> get selectedPayments =>
      [for (final p in payments) if (selected.contains(p.id)) p];

  String get selectedTotal => bulkTotalString(selectedPayments);

  final String statusFilter;
  final List<AdminInstallmentPayment> payments;
  final bool loading;
  final Object? error;
  final int? busyId;

  PaymentVerificationsState copyWith({
    String? statusFilter,
    List<AdminInstallmentPayment>? payments,
    bool? loading,
    Object? Function()? error,
    int? Function()? busyId,
    Set<int>? selected,
    bool? bulkBusy,
    BulkApproveResult? Function()? bulkResult,
    bool? stale,
  }) =>
      PaymentVerificationsState(
        statusFilter: statusFilter ?? this.statusFilter,
        payments: payments ?? this.payments,
        loading: loading ?? this.loading,
        error: error == null ? this.error : error(),
        busyId: busyId == null ? this.busyId : busyId(),
        selected: selected ?? this.selected,
        bulkBusy: bulkBusy ?? this.bulkBusy,
        bulkResult: bulkResult == null ? this.bulkResult : bulkResult(),
        stale: stale ?? this.stale,
      );

  @override
  List<Object?> get props => [
        statusFilter,
        payments,
        loading,
        error,
        busyId,
        selected,
        bulkBusy,
        bulkResult,
        stale,
      ];
}
