import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../registration/domain/registration_form.dart' show PaymentMethod, PaymentMethodX;
import '../../data/payments_repository.dart';
import '../../domain/merged_payment_entities.dart';
import '../../domain/payment_entities.dart';

/// Transaction ids / receipt numbers: same rule as the installment pay dialog.
final RegExp _referencePattern = RegExp(r'^[A-Za-z0-9\-_/ ]{4,64}$');

/// What the member typed for one ticked fee type.
class FeeSelection extends Equatable {
  const FeeSelection({this.amount, this.extraHeads = 0});

  /// Variable (custom amount) types only.
  final num? amount;

  /// Picnic only.
  final int extraHeads;

  FeeSelection copyWith({num? amount, bool clearAmount = false, int? extraHeads}) => FeeSelection(
        amount: clearAmount ? null : (amount ?? this.amount),
        extraHeads: extraHeads ?? this.extraHeads,
      );

  @override
  List<Object?> get props => [amount, extraHeads];
}

class PayFlowFailure extends Equatable {
  const PayFlowFailure({required this.label, required this.error});

  final String label;
  final Object error;

  @override
  List<Object?> get props => [label, error];
}

/// Outcome of one submit round: one "job" per request sent.
class PayFlowResult extends Equatable {
  const PayFlowResult({required this.total, required this.ok, required this.failures});

  final int total;
  final int ok;
  final List<PayFlowFailure> failures;

  bool get allOk => failures.isEmpty;

  @override
  List<Object?> get props => [total, ok, failures];
}

class PayFlowState extends Equatable {
  const PayFlowState({
    required this.summary,
    required this.step,
    required this.selectedDues,
    required this.selectedFees,
    required this.method,
    required this.reference,
    required this.paidOn,
    required this.proof,
    required this.submitting,
    required this.result,
  });

  final PaymentSummary summary;

  /// 1 = what are you paying for, 2 = how did you pay (+ confirm).
  final int step;
  final Set<String> selectedDues;
  final Map<String, FeeSelection> selectedFees;
  final PaymentMethod? method;
  final String reference;
  final DateTime paidOn;
  final ProofFile? proof;
  final bool submitting;
  final PayFlowResult? result;

  OtherFeeType? feeType(String key) {
    for (final f in summary.payableFeeTypes) {
      if (f.key == key) return f;
    }
    return null;
  }

  Iterable<PaymentDue> get tickedDues => summary.dues.where((d) => selectedDues.contains(d.key));

  num feeAmount(String key) {
    final type = feeType(key);
    final sel = selectedFees[key];
    if (type == null || sel == null) return 0;
    if (type.isPicnic) return (type.headFee ?? 0) + sel.extraHeads * (type.additionalHeadFee ?? 0);
    if (type.isVariable) return sel.amount ?? 0;
    return type.amount ?? 0;
  }

  bool get _feesValid => selectedFees.keys.every((k) => feeAmount(k) > 0);

  num get total =>
      tickedDues.fold<num>(0, (sum, d) => sum + d.amount) +
      selectedFees.keys.fold<num>(0, (sum, k) => sum + feeAmount(k));

  bool get hasSelection => selectedDues.isNotEmpty || selectedFees.isNotEmpty;

  bool get canGoNext => hasSelection && _feesValid;

  bool get referenceIsTrxId => method?.usesTransactionId ?? true;

  bool get isReferenceValid => _referencePattern.hasMatch(reference.trim());

  bool get canSubmit => step == 2 && !submitting && canGoNext && method != null && isReferenceValid;

  PayFlowState copyWith({
    int? step,
    Set<String>? selectedDues,
    Map<String, FeeSelection>? selectedFees,
    PaymentMethod? method,
    String? reference,
    DateTime? paidOn,
    ProofFile? proof,
    bool clearProof = false,
    bool? submitting,
    PayFlowResult? result,
    bool clearResult = false,
  }) =>
      PayFlowState(
        summary: summary,
        step: step ?? this.step,
        selectedDues: selectedDues ?? this.selectedDues,
        selectedFees: selectedFees ?? this.selectedFees,
        method: method ?? this.method,
        reference: reference ?? this.reference,
        paidOn: paidOn ?? this.paidOn,
        proof: clearProof ? null : (proof ?? this.proof),
        submitting: submitting ?? this.submitting,
        result: clearResult ? null : (result ?? this.result),
      );

  @override
  List<Object?> get props => [
        summary, step, selectedDues, selectedFees, method, reference, paidOn, proof, submitting, result,
      ];
}

String _isoDate(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// State machine of the merged pay flow. Pure logic: the sheet only renders it.
class PayFlowCubit extends Cubit<PayFlowState> {
  PayFlowCubit({
    required PaymentSummary summary,
    required PaymentsRepository repository,
    DateTime Function()? now,
    String? preselectFee,
  })  : _repository = repository,
        super(_initial(summary, (now ?? DateTime.now)(), preselectFee));

  final PaymentsRepository _repository;
  int _okTotal = 0;

  /// True once at least one request went through (even if others failed), so
  /// the caller knows to reload.
  bool get anySucceeded => _okTotal > 0;

  static PayFlowState _initial(PaymentSummary summary, DateTime now, String? preselectFee) {
    final feeKnown = preselectFee != null && summary.payableFeeTypes.any((f) => f.key == preselectFee);
    return PayFlowState(
      summary: summary,
      step: 1,
      selectedDues: feeKnown
          ? const {}
          : {for (final d in summary.dues) if (!d.pending) d.key},
      selectedFees: feeKnown ? {preselectFee: const FeeSelection()} : const {},
      method: null,
      reference: '',
      paidOn: DateTime(now.year, now.month, now.day),
      proof: null,
      submitting: false,
      result: null,
    );
  }

  void toggleDue(PaymentDue due) {
    if (due.pending || state.submitting) return;
    final next = {...state.selectedDues};
    if (!next.remove(due.key)) next.add(due.key);
    emit(state.copyWith(selectedDues: next));
  }

  void toggleFee(String key) {
    if (state.submitting || state.feeType(key) == null) return;
    final next = {...state.selectedFees};
    if (next.remove(key) == null) next[key] = const FeeSelection();
    emit(state.copyWith(selectedFees: next));
  }

  void setFeeAmount(String key, num? amount) {
    final current = state.selectedFees[key];
    if (current == null) return;
    emit(state.copyWith(
      selectedFees: {...state.selectedFees, key: current.copyWith(amount: amount, clearAmount: amount == null)},
    ));
  }

  void setExtraHeads(String key, int heads) {
    final current = state.selectedFees[key];
    if (current == null) return;
    emit(state.copyWith(selectedFees: {...state.selectedFees, key: current.copyWith(extraHeads: heads < 0 ? 0 : heads)}));
  }

  void next() {
    if (state.step == 1 && state.canGoNext) emit(state.copyWith(step: 2, clearResult: true));
  }

  void back() {
    if (state.step == 2 && !state.submitting) emit(state.copyWith(step: 1, clearResult: true));
  }

  void selectMethod(PaymentMethod method) => emit(state.copyWith(method: method));

  void setReference(String value) => emit(state.copyWith(reference: value));

  void setPaidOn(DateTime date) => emit(state.copyWith(paidOn: DateTime(date.year, date.month, date.day)));

  void setProof(ProofFile? proof) => emit(state.copyWith(proof: proof, clearProof: proof == null));

  /// Sends one request per kind (installments together; each share and fee on
  /// its own). Succeeded items leave the selection; failed ones stay selected
  /// so the member can retry just those.
  Future<void> submit() async {
    if (!state.canSubmit) return;
    final method = state.method!.canonicalKey;
    final reference = state.reference.trim();
    final paidOn = _isoDate(state.paidOn);
    final proof = state.proof;
    emit(state.copyWith(submitting: true, clearResult: true));

    final remainingDues = {...state.selectedDues};
    final remainingFees = {...state.selectedFees};
    final failures = <PayFlowFailure>[];
    var ok = 0;
    var total = 0;

    Future<void> run(String label, Future<void> Function() send, void Function() onOk) async {
      total++;
      try {
        await send();
        ok++;
        onOk();
      } catch (e) {
        failures.add(PayFlowFailure(label: label, error: e));
      }
    }

    final dues = state.tickedDues.toList();
    final installments = dues.where((d) => d.kind == PaymentKind.installment).toList();
    if (installments.isNotEmpty) {
      await run(
        installments.map((d) => d.title).join(', '),
        () => _repository.submitInstallments(PaymentSubmission(
          installmentIds: [for (final d in installments) d.refId],
          method: method,
          transactionRef: reference,
          paidOn: paidOn,
          proof: proof,
        )),
        () => remainingDues.removeAll(installments.map((d) => d.key)),
      );
    }
    for (final share in dues.where((d) => d.kind == PaymentKind.costShare)) {
      await run(
        share.title,
        () async {
          await _repository.submitCostShare(CostSharePaymentSubmission(
            shareId: share.refId,
            amount: share.amount,
            method: method,
            transactionRef: reference,
            paidOn: paidOn,
            proof: proof,
          ));
        },
        () => remainingDues.remove(share.key),
      );
    }
    for (final entry in state.selectedFees.entries) {
      final type = state.feeType(entry.key);
      if (type == null) continue;
      await run(
        type.label,
        () => _repository.submitOtherFee(OtherFeePaymentSubmission(
          feeType: type.key,
          paymentDate: paidOn,
          paymentMethod: method,
          receiptNo: reference,
          amount: type.isVariable ? entry.value.amount : null,
          additionalHeads: type.isPicnic ? entry.value.extraHeads : null,
        )),
        () => remainingFees.remove(entry.key),
      );
    }

    _okTotal += ok;
    emit(state.copyWith(
      submitting: false,
      selectedDues: remainingDues,
      selectedFees: remainingFees,
      result: PayFlowResult(total: total, ok: ok, failures: failures),
    ));
  }
}
