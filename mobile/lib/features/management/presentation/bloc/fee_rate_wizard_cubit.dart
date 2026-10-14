import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../data/admin_repository.dart';
import '../../domain/admin_entities.dart';
import '../../domain/fee_rate_logic.dart';

class FeeRateWizardState extends Equatable {
  const FeeRateWizardState({
    required this.date,
    this.step = 1,
    this.key,
    this.amountText = '',
    this.history = const [],
    this.current,
    this.blocked = false,
    this.loadingHistory = false,
    this.saving = false,
    this.done = false,
    this.error,
  });

  /// 1 = fee + amount, 2 = effective date, 3 = confirm.
  final int step;
  final String? key;
  final String amountText;
  final DateTime date;
  final List<FeeSetting> history;
  final FeeSetting? current;

  /// A future-dated version already exists.
  final bool blocked;
  final bool loadingHistory;
  final bool saving;
  final bool done;
  final Object? error;

  num? get amount => num.tryParse(amountText.trim());

  bool get canNext =>
      step == 1 && key != null && !loadingHistory && !blocked && current != null && (amount ?? 0) > 0;

  FeeRateWizardState copyWith({
    int? step,
    String? key,
    String? amountText,
    DateTime? date,
    List<FeeSetting>? history,
    FeeSetting? Function()? current,
    bool? blocked,
    bool? loadingHistory,
    bool? saving,
    bool? done,
    Object? Function()? error,
  }) =>
      FeeRateWizardState(
        step: step ?? this.step,
        key: key ?? this.key,
        amountText: amountText ?? this.amountText,
        date: date ?? this.date,
        history: history ?? this.history,
        current: current == null ? this.current : current(),
        blocked: blocked ?? this.blocked,
        loadingHistory: loadingHistory ?? this.loadingHistory,
        saving: saving ?? this.saving,
        done: done ?? this.done,
        error: error == null ? this.error : error(),
      );

  @override
  List<Object?> get props =>
      [step, key, amountText, date, history, current, blocked, loadingHistory, saving, done, error];
}

/// Fee-rate wizard (flag fee_wizard): fee + new amount, effective date,
/// confirm. Uses the existing endpoints only.
class FeeRateWizardCubit extends Cubit<FeeRateWizardState> {
  FeeRateWizardCubit({required AdminRepository repository, DateTime Function()? now})
      : _repository = repository,
        _now = now ?? DateTime.now,
        super(FeeRateWizardState(date: _today((now ?? DateTime.now)())));

  final AdminRepository _repository;
  final DateTime Function() _now;

  static DateTime _today(DateTime d) => DateTime(d.year, d.month, d.day);

  Future<void> selectKey(String key) async {
    emit(state.copyWith(
      key: key,
      loadingHistory: true,
      blocked: false,
      current: () => null,
      error: () => null,
      done: false,
    ));
    try {
      final history = await _repository.getFeeSettingHistory(key);
      final today = _today(_now());
      emit(state.copyWith(
        history: history,
        loadingHistory: false,
        current: () => currentRate(history, today),
        blocked: hasFutureVersion(history, today),
      ));
    } catch (e) {
      emit(state.copyWith(loadingHistory: false, error: () => e));
    }
  }

  void setAmount(String text) => emit(state.copyWith(amountText: text));

  void setDate(DateTime date) {
    if (!isEffectiveDateAllowed(date, _today(_now()))) return;
    emit(state.copyWith(date: DateTime(date.year, date.month, date.day)));
  }

  void next() {
    if (state.step == 1 && state.canNext) {
      emit(state.copyWith(step: 2));
    } else if (state.step == 2) {
      emit(state.copyWith(step: 3));
    }
  }

  void back() {
    if (state.step > 1 && !state.saving) emit(state.copyWith(step: state.step - 1, error: () => null));
  }

  /// Back to a clean step 1 (after a successful save).
  void reset() => emit(FeeRateWizardState(date: _today(_now())));

  Future<void> confirm() async {
    final key = state.key;
    final amount = state.amount;
    final current = state.current;
    if (state.step != 3 || state.saving || key == null || amount == null || current == null) return;
    emit(state.copyWith(saving: true, error: () => null));
    try {
      await _repository.createFeeSettingVersion(
        key: key,
        value: amount,
        unit: current.unit,
        startDate: isoDay(state.date),
        feeCategory: current.feeCategory,
      );
      emit(state.copyWith(saving: false, done: true));
    } catch (e) {
      emit(state.copyWith(saving: false, error: () => e));
    }
  }
}
