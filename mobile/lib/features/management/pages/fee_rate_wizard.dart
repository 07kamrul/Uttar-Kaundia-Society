import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/format/bn_format.dart';
import '../../../core/network/api_error_messages.dart';
import '../../../l10n/app_localizations.dart';
import '../../../shared/widgets/widgets.dart';
import '../data/admin_repository.dart';
import '../domain/fee_rate_logic.dart';
import '../presentation/bloc/fee_rate_wizard_cubit.dart';

/// Three-step fee-rate wizard (flag fee_wizard): fee + new amount, effective
/// date (today to +365), confirm "old -> new". Mirrors Angular fee-rate-wizard.
class FeeRateWizard extends StatelessWidget {
  const FeeRateWizard({
    super.key,
    required this.repository,
    required this.feeKeys,
    required this.labelFor,
    required this.onSaved,
    this.now,
  });

  final AdminRepository repository;
  final List<String> feeKeys;
  final String Function(AppLocalizations, String) labelFor;
  final VoidCallback onSaved;
  final DateTime Function()? now;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => FeeRateWizardCubit(repository: repository, now: now),
      child: BlocConsumer<FeeRateWizardCubit, FeeRateWizardState>(
        listenWhen: (a, b) => !a.done && b.done,
        listener: (context, state) {
          showAppToast(context, AppLocalizations.of(context).feeWizardDone);
          onSaved();
        },
        builder: (context, state) => _Body(state: state, feeKeys: feeKeys, labelFor: labelFor, now: now),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.state, required this.feeKeys, required this.labelFor, this.now});

  final FeeRateWizardState state;
  final List<String> feeKeys;
  final String Function(AppLocalizations, String) labelFor;
  final DateTime Function()? now;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final cubit = context.read<FeeRateWizardCubit>();
    return Card(
      key: const Key('feeWizard'),
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(l.feeWizardTitle, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            switch (state.step) {
              1 => _stepFee(context, l, cubit),
              2 => _stepDate(context, l, cubit),
              _ => _stepConfirm(context, l, cubit),
            },
            if (state.error != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(apiErrorMessage(l, state.error!), style: TextStyle(color: Theme.of(context).colorScheme.error)),
              ),
          ],
        ),
      ),
    );
  }

  String _money(AppLocalizations l, num v, String? unit) =>
      unit == 'percent' ? '${bnNumber(v, locale: l.localeName)}%' : taka(v, locale: l.localeName);

  Widget _stepFee(BuildContext context, AppLocalizations l, FeeRateWizardCubit cubit) {
    final current = state.current;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(l.feeWizardStepFee),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final k in feeKeys)
              ChoiceChip(
                key: Key('feeWizardFee_$k'),
                label: Text(labelFor(l, k)),
                selected: state.key == k,
                onSelected: (_) => cubit.selectKey(k),
              ),
          ],
        ),
        if (state.loadingHistory) const Padding(padding: EdgeInsets.only(top: 8), child: LinearProgressIndicator()),
        if (state.blocked)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Text(l.feeWizardBlocked,
                key: const Key('feeWizardBlocked'), style: TextStyle(color: Theme.of(context).colorScheme.error)),
          )
        else if (state.key != null && !state.loadingHistory && current != null) ...[
          const SizedBox(height: 12),
          Text(l.feeWizardCurrent(_money(l, current.value, current.unit))),
          const SizedBox(height: 8),
          TextField(
            key: const Key('feeWizardAmount'),
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
            decoration: InputDecoration(labelText: l.feeWizardNewAmount),
            onChanged: cubit.setAmount,
          ),
          const SizedBox(height: 12),
          AppButton(
            key: const Key('feeWizardNext'),
            label: l.feeWizardNext,
            onPressed: state.canNext ? cubit.next : null,
          ),
        ],
      ],
    );
  }

  Widget _stepDate(BuildContext context, AppLocalizations l, FeeRateWizardCubit cubit) {
    final today = DateTime(DateTime.now().year, DateTime.now().month, DateTime.now().day);
    final base = (now ?? DateTime.now)();
    final first = DateTime(base.year, base.month, base.day);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(l.feeWizardStepDate),
        Text(l.feeWizardDateHint, style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          key: const Key('feeWizardPickDate'),
          icon: const Icon(Icons.event),
          label: Text(bnDate(state.date, locale: l.localeName)),
          onPressed: () async {
            final picked = await showDatePicker(
              context: context,
              initialDate: state.date,
              firstDate: first,
              lastDate: first.add(const Duration(days: feeWizardMaxDaysAhead)),
            );
            if (picked != null) cubit.setDate(picked);
          },
        ),
        const SizedBox(height: 12),
        Row(children: [
          TextButton(onPressed: cubit.back, child: Text(l.feeWizardBack)),
          const Spacer(),
          AppButton(key: const Key('feeWizardNext'), label: l.feeWizardNext, onPressed: cubit.next),
        ]),
        if (today.isAfter(first)) const SizedBox.shrink(),
      ],
    );
  }

  Widget _stepConfirm(BuildContext context, AppLocalizations l, FeeRateWizardCubit cubit) {
    final current = state.current;
    final text = l.feeWizardConfirmText(
      current == null ? '—' : _money(l, current.value, current.unit),
      _money(l, state.amount ?? 0, current?.unit),
      bnDate(state.date, locale: l.localeName),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(l.feeWizardConfirmTitle, style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 8),
        Text(text, key: const Key('feeWizardConfirmText')),
        const SizedBox(height: 12),
        Row(children: [
          TextButton(onPressed: state.saving ? null : cubit.back, child: Text(l.feeWizardBack)),
          const Spacer(),
          AppButton(
            key: const Key('feeWizardConfirm'),
            label: l.feeWizardConfirm,
            loading: state.saving,
            onPressed: state.saving ? null : cubit.confirm,
          ),
        ]),
      ],
    );
  }
}
