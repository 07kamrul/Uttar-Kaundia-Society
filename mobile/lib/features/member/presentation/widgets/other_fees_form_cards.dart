import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../l10n/app_localizations.dart';
import '../../../../shared/widgets/widgets.dart';
import '../../domain/merged_payment_entities.dart';
import '../../domain/other_fees_entities.dart';
import '../bloc/other_fees_cubit.dart';
import '../other_fees_strings.dart';
import 'member_ui.dart';

/// Display label for a fee key: catalog label when known, else humanized.
String otherFeeTypeLabel(OtherFeesState state, String key) {
  for (final t in state.feeTypes) {
    if (t.key == key && t.label.trim().isNotEmpty) return t.label;
  }
  return humanizeFeeKey(key);
}

/// Payment date, fee-type chooser, catalog errors and the cost breakdown.
class OtherFeesTypeCard extends StatelessWidget {
  const OtherFeesTypeCard({super.key, required this.state, required this.cubit});

  final OtherFeesState state;
  final OtherFeesCubit cubit;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    final s = OtherFeesStrings.of(context);
    final type = state.selectedType;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          DatePickerField(
            label: loc.memberPicnicDateLabel,
            value: state.paymentDate,
            onPicked: cubit.changeDate,
          ),
          const SizedBox(height: 16),
          if (state.typesLoading)
            const LinearProgressIndicator()
          else if (state.typesError != OtherFeesTypesError.none)
            _TypesErrorBanner(error: state.typesError, onRetry: cubit.loadFeeTypes)
          else if (state.feeTypes.isEmpty)
            Text(s.noFeeTypes)
          else ...[
            Text(s.feeTypeLabel, style: Theme.of(context).textTheme.labelLarge),
            const SizedBox(height: 8),
            _TypeChips(state: state, cubit: cubit),
          ],
          if (!state.typesLoading && type != null) ...[
            const SizedBox(height: 16),
            if (state.isPayOncePaid)
              NoticeBanner(margin: EdgeInsets.zero, tone: NoticeTone.success, message: s.alreadyPaid)
            else
              _Breakdown(state: state, type: type),
          ],
        ],
      ),
    );
  }
}

class _TypesErrorBanner extends StatelessWidget {
  const _TypesErrorBanner({required this.error, required this.onRetry});

  final OtherFeesTypesError error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    return NoticeBanner(
      margin: EdgeInsets.zero,
      tone: NoticeTone.error,
      message: switch (error) {
        OtherFeesTypesError.notConfigured => loc.memberPicnicNotConfigured,
        OtherFeesTypesError.access => loc.memberPicnicAccessDenied,
        _ => loc.memberPicnicFeeLoadFailed,
      },
      action: TextButton.icon(
        onPressed: onRetry,
        icon: const Icon(Icons.refresh, size: 18),
        label: Text(loc.memberPicnicRetry),
      ),
    );
  }
}

class _TypeChips extends StatelessWidget {
  const _TypeChips({required this.state, required this.cubit});

  final OtherFeesState state;
  final OtherFeesCubit cubit;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final t in state.feeTypes)
          ChoiceChip(
            key: Key('otherFeesType_${t.key}'),
            label: Text(otherFeeTypeLabel(state, t.key)),
            selected: t.key == state.selectedKey,
            onSelected: state.saving ? null : (_) => cubit.selectType(t.key),
          ),
      ],
    );
  }
}

/// Live, display-only preview; the server recomputes the real total.
class _Breakdown extends StatelessWidget {
  const _Breakdown({required this.state, required this.type});

  final OtherFeesState state;
  final OtherFeeType type;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    final b = state.breakdown;
    if (b == null) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (b.isPicnic) ...[
          _FeeLine(label: loc.memberPicnicMemberHead, value: '1 × ৳ ${b.headFee}'),
          if (b.count > 0)
            _FeeLine(
              label: loc.memberPicnicAdditionalHeads,
              value: '${b.count} × ৳ ${b.additionalHeadFee} = ৳ ${b.additionalAmount}',
            ),
        ] else
          _FeeLine(label: otherFeeTypeLabel(state, type.key), value: '1 × ৳ ${b.total}'),
        const SizedBox(height: 8),
        _TotalBox(label: loc.memberPicnicTotal, value: '৳ ${b.total}'),
      ],
    );
  }
}

class _FeeLine extends StatelessWidget {
  const _FeeLine({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(child: Text(label, style: theme.textTheme.bodyMedium)),
          const SizedBox(width: 12),
          Text(value, style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

class _TotalBox extends StatelessWidget {
  const _TotalBox({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: theme.colorScheme.primaryContainer,
        borderRadius: BorderRadius.circular(AppRadius.md),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: theme.textTheme.titleSmall?.copyWith(color: theme.colorScheme.onPrimaryContainer),
            ),
          ),
          Text(
            value,
            style: theme.textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w700,
              color: theme.colorScheme.primary,
            ),
          ),
        ],
      ),
    );
  }
}

/// Picnic only: additional-heads stepper plus a name/relation row per head.
class OtherFeesHeadsCard extends StatelessWidget {
  const OtherFeesHeadsCard({super.key, required this.state, required this.cubit});

  final OtherFeesState state;
  final OtherFeesCubit cubit;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final heads = state.additionalHeads;
    final title = loc.memberPicnicAdditionalHeadsLabel;
    return AppCard(
      title: title,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              IconButton.filledTonal(
                tooltip: '$title −1',
                onPressed: heads > 0 ? () => cubit.setHeads(heads - 1) : null,
                icon: const Icon(Icons.remove),
              ),
              SizedBox(
                width: 56,
                child: Text(
                  '$heads',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              IconButton.filledTonal(
                tooltip: '$title +1',
                onPressed: heads < maxOtherFeeHeads ? () => cubit.setHeads(heads + 1) : null,
                icon: const Icon(Icons.add),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  loc.memberPicnicAdditionalHeadsHint(maxOtherFeeHeads),
                  style: theme.textTheme.bodySmall,
                ),
              ),
            ],
          ),
          for (var i = 0; i < state.labels.length; i++) ...[
            const SizedBox(height: 12),
            _HeadRow(index: i, label: state.labels[i], cubit: cubit),
          ],
        ],
      ),
    );
  }
}

class _HeadRow extends StatelessWidget {
  const _HeadRow({required this.index, required this.label, required this.cubit});

  final int index;
  final FeeHeadLabel label;
  final OtherFeesCubit cubit;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    final n = index + 1;
    return FieldGrid(
      children: [
        SyncedTextField(
          value: label.name,
          label: loc.memberPicnicHeadNameLabel(n),
          icon: Icons.person_outline,
          onChanged: (v) => cubit.setLabelName(index, v),
        ),
        DropdownButtonFormField<FeeHeadRelation>(
          key: ValueKey('otherFeesRelation-$index-${label.relation}'),
          initialValue: label.relation,
          isExpanded: true,
          decoration: InputDecoration(
            labelText: loc.memberPicnicHeadRelationLabel(n),
            prefixIcon: const Icon(Icons.family_restroom_outlined),
          ),
          items: [
            DropdownMenuItem(value: FeeHeadRelation.spouse, child: Text(loc.memberPicnicRelationsSpouse)),
            DropdownMenuItem(value: FeeHeadRelation.child, child: Text(loc.memberPicnicRelationsChild)),
            DropdownMenuItem(value: FeeHeadRelation.guest, child: Text(loc.memberPicnicRelationsGuest)),
          ],
          onChanged: (v) {
            if (v != null) cubit.setLabelRelation(index, v);
          },
        ),
      ],
    );
  }
}

/// Amount (variable types), receipt, method, note and submit.
class OtherFeesPaymentCard extends StatelessWidget {
  const OtherFeesPaymentCard({super.key, required this.state, required this.cubit});

  final OtherFeesState state;
  final OtherFeesCubit cubit;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    final s = OtherFeesStrings.of(context);
    final isVariable = state.selectedType?.isVariable == true;
    if (state.isPayOncePaid) return const SizedBox.shrink();
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (isVariable) ...[
            SyncedTextField(
              key: const Key('otherFeesAmount'),
              value: state.amountText,
              label: s.amountLabel,
              icon: Icons.payments_outlined,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              errorText: state.amountText.isNotEmpty && !state.amountValid ? s.amountRequired : null,
              onChanged: cubit.setAmount,
            ),
            const SizedBox(height: 12),
          ],
          FieldGrid(
            children: [
              DropdownButtonFormField<String>(
                key: ValueKey('otherFeesMethod-${state.paymentMethod}'),
                initialValue: state.paymentMethod,
                isExpanded: true,
                decoration: InputDecoration(
                  labelText: loc.memberPicnicMethodLabel,
                  prefixIcon: const Icon(Icons.account_balance_wallet_outlined),
                ),
                items: [
                  for (final m in otherFeeMethods) DropdownMenuItem(value: m, child: Text(_methodLabel(loc, m))),
                ],
                onChanged: (v) {
                  if (v != null) cubit.setPaymentMethod(v);
                },
              ),
              SyncedTextField(
                value: state.receiptNo,
                label: loc.memberPicnicReceiptNoLabel,
                icon: Icons.receipt_outlined,
                onChanged: cubit.setReceiptNo,
              ),
            ],
          ),
          if (isVariable) ...[
            const SizedBox(height: 12),
            SyncedTextField(
              value: state.note,
              label: s.noteLabel,
              icon: Icons.notes_outlined,
              textInputAction: TextInputAction.done,
              onChanged: cubit.setNote,
            ),
          ],
          const SizedBox(height: 16),
          AppButton(
            key: const Key('otherFeesSubmit'),
            label: state.saving ? loc.memberPicnicSaving : loc.memberPicnicSubmit,
            icon: Icons.check_circle_outline,
            expanded: true,
            loading: state.saving,
            onPressed: state.canSubmit ? cubit.submit : null,
          ),
        ],
      ),
    );
  }

  static String _methodLabel(AppLocalizations loc, String method) => switch (method) {
        'Cash' => loc.memberPicnicMethodsCash,
        'bKash' => loc.memberPicnicMethodsBKash,
        'Nagad' => loc.memberPicnicMethodsNagad,
        'Bank Transfer' => loc.memberPicnicMethodsBankTransfer,
        _ => loc.memberPicnicMethodsOther,
      };
}
