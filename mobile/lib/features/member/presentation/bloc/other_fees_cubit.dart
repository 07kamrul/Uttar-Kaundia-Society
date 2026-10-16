import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/network/api_exception.dart';
import '../../data/other_fees_repository.dart';
import '../../domain/merged_payment_entities.dart';
import '../../domain/other_fees_entities.dart';

/// Payment methods offered by the form (Angular PAYMENT_METHOD_OPTIONS).
const otherFeeMethods = ['Cash', 'bKash', 'Nagad', 'Bank Transfer', 'Other'];

/// History page size (Angular PAGE_SIZE).
const otherFeesPageSize = 10;

/// Why the fee-type catalog failed (Angular ErrorKind).
enum OtherFeesTypesError { none, notConfigured, access, generic }

OtherFeesTypesError classifyOtherFeesTypesError(Object error) {
  if (error is ApiException && !error.isNetwork) {
    if (error.statusCode == 404) return OtherFeesTypesError.notConfigured;
    if (error.statusCode == 403) return OtherFeesTypesError.access;
  }
  return OtherFeesTypesError.generic;
}

class OtherFeesState extends Equatable {
  const OtherFeesState({
    this.paymentDate = '',
    this.feeTypes = const [],
    this.selectedKey,
    this.typesLoading = true,
    this.typesError = OtherFeesTypesError.none,
    this.additionalHeads = 0,
    this.labels = const [],
    this.receiptNo = '',
    this.paymentMethod = 'Cash',
    this.amountText = '',
    this.note = '',
    this.saving = false,
    this.saveError,
    this.doneCount = 0,
    this.lastSavedTotal,
    this.history,
    this.historyLoading = true,
    this.historyError = false,
    this.historyPage = 1,
    this.filter = const OtherFeeHistoryFilter(),
  });

  final String paymentDate;
  final List<OtherFeeType> feeTypes;
  final String? selectedKey;
  final bool typesLoading;
  final OtherFeesTypesError typesError;
  final int additionalHeads;
  final List<FeeHeadLabel> labels;
  final String receiptNo;
  final String paymentMethod;
  final String amountText;
  final String note;
  final bool saving;
  final Object? saveError;

  /// Grows on every successful save; the page toasts when it changes.
  final int doneCount;
  final num? lastSavedTotal;
  final OtherFeeHistoryPage? history;
  final bool historyLoading;
  final bool historyError;
  final int historyPage;
  final OtherFeeHistoryFilter filter;

  OtherFeeType? get selectedType {
    for (final t in feeTypes) {
      if (t.key == selectedKey) return t;
    }
    return null;
  }

  OtherFeeBreakdown? get breakdown => otherFeeBreakdown(selectedType, additionalHeads);

  bool get isPayOncePaid => selectedType?.payOnce == true && selectedType?.alreadyPaid == true;

  num? get parsedAmount => num.tryParse(amountText.trim());

  bool get amountValid {
    final type = selectedType;
    if (type == null) return false;
    if (!type.isVariable) return true;
    final v = parsedAmount;
    return v != null && v > 0;
  }

  bool get labelsValid => selectedType?.isPicnic != true || labels.every((l) => l.name.trim().isNotEmpty);

  bool get canSubmit =>
      !saving &&
      !typesLoading &&
      selectedType != null &&
      !isPayOncePaid &&
      paymentDate.isNotEmpty &&
      paymentMethod.isNotEmpty &&
      amountValid &&
      labelsValid;

  int get totalPages {
    final h = history;
    if (h == null) return 1;
    final pages = (h.total / otherFeesPageSize).ceil();
    return pages < 1 ? 1 : pages;
  }

  /// Payable types plus any type already in the member's history.
  List<String> get filterTypeKeys => {
        for (final t in feeTypes) t.key,
        ...?history?.summary.byType.keys,
      }.toList();

  OtherFeesState copyWith({
    String? paymentDate,
    List<OtherFeeType>? feeTypes,
    String? Function()? selectedKey,
    bool? typesLoading,
    OtherFeesTypesError? typesError,
    int? additionalHeads,
    List<FeeHeadLabel>? labels,
    String? receiptNo,
    String? paymentMethod,
    String? amountText,
    String? note,
    bool? saving,
    Object? Function()? saveError,
    int? doneCount,
    num? lastSavedTotal,
    OtherFeeHistoryPage? history,
    bool? historyLoading,
    bool? historyError,
    int? historyPage,
    OtherFeeHistoryFilter? filter,
  }) =>
      OtherFeesState(
        paymentDate: paymentDate ?? this.paymentDate,
        feeTypes: feeTypes ?? this.feeTypes,
        selectedKey: selectedKey == null ? this.selectedKey : selectedKey(),
        typesLoading: typesLoading ?? this.typesLoading,
        typesError: typesError ?? this.typesError,
        additionalHeads: additionalHeads ?? this.additionalHeads,
        labels: labels ?? this.labels,
        receiptNo: receiptNo ?? this.receiptNo,
        paymentMethod: paymentMethod ?? this.paymentMethod,
        amountText: amountText ?? this.amountText,
        note: note ?? this.note,
        saving: saving ?? this.saving,
        saveError: saveError == null ? this.saveError : saveError(),
        doneCount: doneCount ?? this.doneCount,
        lastSavedTotal: lastSavedTotal ?? this.lastSavedTotal,
        history: history ?? this.history,
        historyLoading: historyLoading ?? this.historyLoading,
        historyError: historyError ?? this.historyError,
        historyPage: historyPage ?? this.historyPage,
        filter: filter ?? this.filter,
      );

  @override
  List<Object?> get props => [
        paymentDate, feeTypes, selectedKey, typesLoading, typesError, additionalHeads, labels,
        receiptNo, paymentMethod, amountText, note, saving, saveError, doneCount, lastSavedTotal,
        history, historyLoading, historyError, historyPage, filter,
      ];
}

/// Port of Angular OtherFeesComponent: fee-type catalog (date driven), a
/// per-calculation form (fixed / variable / picnic) and filtered history.
class OtherFeesCubit extends Cubit<OtherFeesState> {
  OtherFeesCubit(this._repo, {String? initialType, String? today})
      : _initialType = initialType,
        super(OtherFeesState(paymentDate: today ?? DateTime.now().toIso8601String().substring(0, 10)));

  final OtherFeesRepository _repo;
  final String? _initialType;

  Future<void> start() => Future.wait([loadFeeTypes(preselect: _initialType), loadHistory()]);

  Future<void> loadFeeTypes({String? preselect}) async {
    emit(state.copyWith(typesLoading: true, typesError: OtherFeesTypesError.none));
    try {
      final types = await _repo.getFeeTypes(paymentDate: state.paymentDate);
      if (isClosed) return;
      final current = preselect ?? state.selectedKey;
      final wanted = types.any((t) => t.key == current) ? current : (types.isEmpty ? null : types.first.key);
      emit(state.copyWith(feeTypes: List.unmodifiable(types), typesLoading: false));
      // Like Angular, a reload re-selects (and resets the form) so a fixed
      // amount that changed with the date is never stale.
      if (wanted != null) selectType(wanted);
    } on Exception catch (e) {
      if (isClosed) return;
      emit(state.copyWith(
        feeTypes: const [],
        selectedKey: () => null,
        typesLoading: false,
        typesError: classifyOtherFeesTypesError(e),
      ));
    }
  }

  void selectType(String key) {
    final type = state.feeTypes.where((t) => t.key == key).firstOrNull;
    emit(state.copyWith(
      selectedKey: () => key,
      additionalHeads: 0,
      labels: const [],
      note: '',
      saveError: () => null,
      amountText: type == null || type.isVariable ? '' : '${type.amount ?? ''}',
    ));
  }

  Future<void> changeDate(String value) async {
    emit(state.copyWith(paymentDate: value));
    if (value.isNotEmpty) await loadFeeTypes();
  }

  void setHeads(int count) {
    final clamped = count.clamp(0, maxOtherFeeHeads);
    if (clamped == state.additionalHeads) return;
    final labels = [
      for (var i = 0; i < clamped; i++) i < state.labels.length ? state.labels[i] : const FeeHeadLabel(name: ''),
    ];
    emit(state.copyWith(additionalHeads: clamped, labels: List.unmodifiable(labels)));
  }

  void setLabelName(int index, String name) => _updateLabel(index, (l) => l.copyWith(name: name));

  void setLabelRelation(int index, FeeHeadRelation relation) =>
      _updateLabel(index, (l) => l.copyWith(relation: relation));

  void _updateLabel(int index, FeeHeadLabel Function(FeeHeadLabel) update) {
    if (index < 0 || index >= state.labels.length) return;
    final labels = [
      for (var i = 0; i < state.labels.length; i++) i == index ? update(state.labels[i]) : state.labels[i],
    ];
    emit(state.copyWith(labels: List.unmodifiable(labels)));
  }

  void setReceiptNo(String v) => emit(state.copyWith(receiptNo: v));
  void setPaymentMethod(String v) => emit(state.copyWith(paymentMethod: v));
  void setAmount(String v) => emit(state.copyWith(amountText: v));
  void setNote(String v) => emit(state.copyWith(note: v));

  /// Returns true when the payment was saved.
  Future<bool> submit() async {
    final type = state.selectedType;
    if (type == null || !state.canSubmit) return false;
    emit(state.copyWith(saving: true, saveError: () => null));
    try {
      final saved = await _repo.createPayment(OtherFeeCreateInput(
        feeType: type.key,
        paymentDate: state.paymentDate,
        paymentMethod: state.paymentMethod,
        receiptNo: state.receiptNo.trim().isEmpty ? null : state.receiptNo.trim(),
        note: state.note.trim().isEmpty ? null : state.note.trim(),
        amount: type.isVariable ? state.parsedAmount : null,
        additionalHeads: type.isPicnic ? state.additionalHeads : null,
        additionalPeople: type.isPicnic ? state.labels : const [],
      ));
      if (isClosed) return true;
      emit(state.copyWith(
        saving: false,
        doneCount: state.doneCount + 1,
        lastSavedTotal: saved.amount,
        additionalHeads: 0,
        labels: const [],
        receiptNo: '',
        note: '',
        amountText: type.isVariable ? '' : null,
        historyPage: 1,
      ));
      await loadHistory();
      return true;
    } on Exception catch (e) {
      if (!isClosed) emit(state.copyWith(saving: false, saveError: () => e));
      return false;
    }
  }

  Future<void> loadHistory() async {
    emit(state.copyWith(historyLoading: true, historyError: false));
    try {
      final page = await _repo.getPayments(state.filter, page: state.historyPage, pageSize: otherFeesPageSize);
      if (!isClosed) emit(state.copyWith(history: page, historyLoading: false));
    } on Exception {
      if (!isClosed) emit(state.copyWith(historyLoading: false, historyError: true));
    }
  }

  void setFilter(OtherFeeHistoryFilter filter) => emit(state.copyWith(filter: filter));

  Future<void> applyFilters() {
    emit(state.copyWith(historyPage: 1));
    return loadHistory();
  }

  Future<void> resetFilters() {
    emit(state.copyWith(filter: const OtherFeeHistoryFilter()));
    return applyFilters();
  }

  Future<void> goToPage(int page) async {
    if (page < 1 || page > state.totalPages || page == state.historyPage) return;
    emit(state.copyWith(historyPage: page));
    await loadHistory();
  }

  Future<void> refresh() => start();
}
