import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/format/bn_format.dart';
import '../../../../core/network/api_error_messages.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/validation/bd_input.dart' show toAsciiDigits;
import '../../../../l10n/app_localizations.dart';
import '../../../../shared/utils/image_compression.dart';
import '../../../../shared/widgets/payment_method_widgets.dart';
import '../../../registration/domain/registration_form.dart' show PaymentMethod, PaymentMethodX;
import '../../data/payments_repository.dart';
import '../../domain/merged_payment_entities.dart';
import '../../domain/payment_entities.dart';
import '../bloc/pay_flow_cubit.dart';

const double _sheetMaxWidth = 560;
const int _maxProofBytes = 5 * 1024 * 1024;

/// What happened in the sheet, so the caller can reload and toast.
class PayFlowOutcome {
  const PayFlowOutcome({required this.anySucceeded, required this.allSucceeded});

  final bool anySucceeded;
  final bool allSucceeded;
}

/// Opens the merged pay flow (step 1 what, step 2 how + confirm). Resolves
/// when the sheet closes.
Future<PayFlowOutcome> showPayFlowSheet(
  BuildContext context, {
  required PaymentSummary summary,
  required PaymentsRepository repository,
  String? preselectFee,
}) async {
  final cubit = PayFlowCubit(summary: summary, repository: repository, preselectFee: preselectFee);
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => BlocProvider.value(value: cubit, child: const PayFlowSheet()),
  );
  final outcome = PayFlowOutcome(
    anySucceeded: cubit.anySucceeded,
    allSucceeded: cubit.state.result?.allOk == true,
  );
  await cubit.close();
  return outcome;
}

class PayFlowSheet extends StatelessWidget {
  const PayFlowSheet({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<PayFlowCubit, PayFlowState>(
      listenWhen: (a, b) => a.result != b.result && b.result?.allOk == true,
      listener: (context, state) => Navigator.of(context).pop(),
      builder: (context, state) => Align(
        alignment: Alignment.bottomCenter,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: _sheetMaxWidth),
          child: Padding(
            padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              child: state.step == 1 ? const _WhatStep() : const _HowStep(),
            ),
          ),
        ),
      ),
    );
  }
}

String _money(BuildContext context, num amount) => taka(amount, locale: AppLocalizations.of(context).localeName);

class _TotalBar extends StatelessWidget {
  const _TotalBar({required this.total});

  final num total;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      key: const Key('payTotal'),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: theme.colorScheme.primaryContainer,
        borderRadius: BorderRadius.circular(AppRadius.sm),
      ),
      child: Row(
        children: [
          Expanded(child: Text(AppLocalizations.of(context).mpayTotal, style: theme.textTheme.titleMedium)),
          Text(
            _money(context, total),
            style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700, color: theme.colorScheme.primary),
          ),
        ],
      ),
    );
  }
}

class _WhatStep extends StatelessWidget {
  const _WhatStep();

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final cubit = context.read<PayFlowCubit>();
    final state = context.watch<PayFlowCubit>().state;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(l10n.mpayForWhat, style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 8),
        for (final due in state.summary.dues)
          CheckboxListTile(
            key: Key('payDue_${due.key}'),
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            value: state.selectedDues.contains(due.key),
            onChanged: due.pending ? null : (_) => cubit.toggleDue(due),
            title: Text(due.title),
            subtitle: due.pending ? Text(l10n.mpayStatusPending) : null,
            secondary: due.pending && due.amount <= 0
                ? null
                : Text(_money(context, due.amount), style: Theme.of(context).textTheme.titleSmall),
          ),
        for (final fee in state.summary.payableFeeTypes) _FeeTile(fee: fee, state: state),
        const SizedBox(height: 12),
        _TotalBar(total: state.total),
        const SizedBox(height: 12),
        FilledButton(
          key: const Key('payNext'),
          onPressed: state.canGoNext ? cubit.next : null,
          child: Text(l10n.mpayNext),
        ),
      ],
    );
  }
}

class _FeeTile extends StatelessWidget {
  const _FeeTile({required this.fee, required this.state});

  final OtherFeeType fee;
  final PayFlowState state;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final cubit = context.read<PayFlowCubit>();
    final selection = state.selectedFees[fee.key];
    final fixed = fee.isFixed ? fee.amount : null;
    return Column(
      children: [
        CheckboxListTile(
          key: Key('payFee_${fee.key}'),
          contentPadding: EdgeInsets.zero,
          controlAffinity: ListTileControlAffinity.leading,
          value: selection != null,
          onChanged: (_) => cubit.toggleFee(fee.key),
          title: Text(fee.label),
          secondary: fixed == null && !fee.isPicnic
              ? null
              : Text(_money(context, fee.isPicnic ? (fee.headFee ?? 0) : fixed!),
                  style: Theme.of(context).textTheme.titleSmall),
        ),
        if (selection != null && fee.isVariable)
          Padding(
            padding: const EdgeInsets.only(left: 40, bottom: 8),
            child: TextField(
              key: Key('payFeeAmount_${fee.key}'),
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9০-৯.]'))],
              decoration: InputDecoration(labelText: l10n.mpayFeeAmount, isDense: true),
              onChanged: (v) => cubit.setFeeAmount(fee.key, num.tryParse(toAsciiDigits(v.trim()))),
            ),
          ),
        if (selection != null && fee.isPicnic)
          Padding(
            padding: const EdgeInsets.only(left: 40, bottom: 8),
            child: Row(
              children: [
                Expanded(child: Text(l10n.mpayPicnicExtra)),
                IconButton(
                  key: Key('payExtraMinus_${fee.key}'),
                  icon: const Icon(Icons.remove_circle_outline),
                  onPressed: selection.extraHeads > 0
                      ? () => cubit.setExtraHeads(fee.key, selection.extraHeads - 1)
                      : null,
                ),
                Text(bnNumber(selection.extraHeads, locale: l10n.localeName),
                    style: Theme.of(context).textTheme.titleMedium),
                IconButton(
                  key: Key('payExtraPlus_${fee.key}'),
                  icon: const Icon(Icons.add_circle_outline),
                  onPressed: () => cubit.setExtraHeads(fee.key, selection.extraHeads + 1),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _HowStep extends StatefulWidget {
  const _HowStep();

  @override
  State<_HowStep> createState() => _HowStepState();
}

class _HowStepState extends State<_HowStep> {
  late final TextEditingController _reference = TextEditingController(text: context.read<PayFlowCubit>().state.reference);
  String? _proofName;
  bool _proofTooLarge = false;

  @override
  void dispose() {
    _reference.dispose();
    super.dispose();
  }

  Future<void> _pickProof() async {
    final cubit = context.read<PayFlowCubit>();
    final picked = await pickPaymentProof(context);
    if (picked == null) return;
    final file = await compressForUpload(File(picked.path));
    final bytes = await file.readAsBytes();
    if (bytes.length > _maxProofBytes) {
      cubit.setProof(null);
      if (mounted) {
        setState(() {
          _proofName = null;
          _proofTooLarge = true;
        });
      }
      return;
    }
    final name = file.path == picked.path ? picked.name : file.path.split(RegExp(r'[\\/]')).last;
    cubit.setProof(ProofFile(bytes: bytes, fileName: name, mimeType: _mimeOf(name)));
    if (mounted) {
      setState(() {
        _proofName = name;
        _proofTooLarge = false;
      });
    }
  }

  static String _mimeOf(String name) {
    final lower = name.toLowerCase();
    if (lower.endsWith('.pdf')) return 'application/pdf';
    if (lower.endsWith('.png')) return 'image/png';
    return 'image/jpeg';
  }

  Future<void> _pickDate() async {
    final cubit = context.read<PayFlowCubit>();
    final today = DateTime.now();
    final date = await showDatePicker(
      context: context,
      initialDate: cubit.state.paidOn,
      firstDate: DateTime(today.year - 2),
      lastDate: today,
    );
    if (date != null) cubit.setPaidOn(date);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final cubit = context.read<PayFlowCubit>();
    final state = context.watch<PayFlowCubit>().state;
    final method = state.method;
    final accounts = method == null
        ? const <PaymentAccount>[]
        : state.summary.accounts.where((a) => a.method == method.canonicalKey).toList();
    final result = state.result;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            IconButton(
              key: const Key('payBack'),
              tooltip: l10n.mpayBack,
              icon: const Icon(Icons.arrow_back),
              onPressed: state.submitting ? null : cubit.back,
            ),
            Expanded(child: Text(l10n.mpayHow, style: theme.textTheme.titleLarge)),
          ],
        ),
        const SizedBox(height: 8),
        PaymentMethodCards(selected: method, onSelected: cubit.selectMethod),
        if (accounts.isNotEmpty)
          PaymentAccountsBox(accounts: [for (final a in accounts) PaymentAccountLine(number: a.details)]),
        const SizedBox(height: 12),
        TextField(
          key: const Key('payReferenceField'),
          controller: _reference,
          textInputAction: TextInputAction.done,
          inputFormatters: [LengthLimitingTextInputFormatter(64)],
          decoration: InputDecoration(
            labelText: paymentReferenceLabel(l10n, method ?? PaymentMethod.bkash),
            prefixIcon: const Icon(Icons.receipt_long_outlined),
            helperText: state.reference.isNotEmpty && !state.isReferenceValid ? l10n.mpayRefRequired : null,
          ),
          onChanged: cubit.setReference,
        ),
        const SizedBox(height: 8),
        ListTile(
          key: const Key('payDateTile'),
          contentPadding: EdgeInsets.zero,
          leading: const Icon(Icons.event_outlined),
          title: Text(l10n.mpayPaidOn),
          subtitle: Text(bnDate(state.paidOn, locale: l10n.localeName)),
          onTap: _pickDate,
        ),
        _proofRow(l10n, state),
        const AbroadPaymentNote(),
        const SizedBox(height: 8),
        _TotalBar(total: state.total),
        if (result != null && !result.allOk) ...[
          const SizedBox(height: 12),
          _FailureList(result: result),
        ],
        const SizedBox(height: 12),
        FilledButton(
          key: const Key('paySubmit'),
          onPressed: state.canSubmit ? cubit.submit : null,
          child: state.submitting
              ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
              : Text(result != null && !result.allOk ? l10n.mpayRetryRest : l10n.mpaySubmit),
        ),
      ],
    );
  }

  Widget _proofRow(AppLocalizations l10n, PayFlowState state) {
    final error = Theme.of(context).colorScheme.error;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        OutlinedButton.icon(
          key: const Key('payProofButton'),
          icon: Icon(state.proof == null ? Icons.upload_file_outlined : Icons.check_circle_outline, size: 20),
          label: Text(_proofName ?? l10n.regPayScreenshot, overflow: TextOverflow.ellipsis),
          onPressed: _pickProof,
        ),
        if (_proofTooLarge)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(l10n.mpayProofTooLarge, style: TextStyle(color: error)),
          ),
      ],
    );
  }
}

class _FailureList extends StatelessWidget {
  const _FailureList({required this.result});

  final PayFlowResult result;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final lang = l10n.localeName;
    return Container(
      key: const Key('payResult'),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.colorScheme.errorContainer,
        borderRadius: BorderRadius.circular(AppRadius.sm),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l10n.mpayPartial(bnNumber(result.ok, locale: lang), bnNumber(result.total, locale: lang)),
            style: theme.textTheme.titleSmall,
          ),
          for (final f in result.failures) ...[
            const SizedBox(height: 6),
            Text(f.label, style: theme.textTheme.bodySmall),
            Text(apiErrorMessage(l10n, f.error), style: theme.textTheme.bodyMedium),
          ],
        ],
      ),
    );
  }
}
