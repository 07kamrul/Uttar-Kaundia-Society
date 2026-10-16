import 'package:flutter/material.dart';

import '../../../../core/feature_flags/feature_flag.dart';
import '../../../../core/feature_flags/feature_flag_builder.dart' show flagEnabled;
import '../../../../core/layout/responsive.dart';
import '../../../../l10n/app_localizations.dart';
import '../../../../shared/widgets/widgets.dart';
import '../../domain/other_fees_entities.dart';
import '../bloc/other_fees_cubit.dart';
import '../other_fees_strings.dart';
import 'member_ui.dart';
import 'other_fees_form_cards.dart' show otherFeeTypeLabel;

/// History section of the Other Fees page (Angular history table): filters,
/// per-type summary, payment cards and pagination.
List<Widget> otherFeesHistory(BuildContext context, OtherFeesState state, OtherFeesCubit cubit) {
  final s = OtherFeesStrings.of(context);
  final loc = AppLocalizations.of(context);
  final history = state.history;
  return [
    SectionTitle(s.historyTitle),
    _HistoryFilters(state: state, cubit: cubit),
    if (history != null) _SummaryChips(state: state, history: history),
    if (state.historyLoading)
      const SkeletonLoader(lines: 3)
    else if (state.historyError)
      NoticeBanner(
        tone: NoticeTone.error,
        message: loc.memberPicnicHistoryLoadFailed,
        action: TextButton.icon(
          onPressed: cubit.loadHistory,
          icon: const Icon(Icons.refresh, size: 18),
          label: Text(loc.memberPicnicRetry),
        ),
      )
    else if (history == null || history.items.isEmpty)
      EmptyState(message: s.historyEmpty, icon: Icons.receipt_long_outlined)
    else ...[
      Gutter(
        child: ResponsiveGrid(
          minItemWidth: 300,
          maxColumns: 2,
          children: [for (final p in history.items) _HistoryCard(state: state, payment: p)],
        ),
      ),
      if (history.total > 0) _Pagination(state: state, cubit: cubit),
    ],
  ];
}

class _HistoryFilters extends StatelessWidget {
  const _HistoryFilters({required this.state, required this.cubit});

  final OtherFeesState state;
  final OtherFeesCubit cubit;

  @override
  Widget build(BuildContext context) {
    final s = OtherFeesStrings.of(context);
    final f = state.filter;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          DropdownButtonFormField<String>(
            key: ValueKey('otherFeesFilterType-${f.feeType}'),
            initialValue: f.feeType ?? '',
            isExpanded: true,
            decoration: InputDecoration(labelText: s.feeTypeLabel, prefixIcon: const Icon(Icons.filter_list)),
            items: [
              DropdownMenuItem(value: '', child: Text(s.allTypes)),
              for (final k in state.filterTypeKeys)
                DropdownMenuItem(value: k, child: Text(otherFeeTypeLabel(state, k))),
            ],
            onChanged: (v) => cubit.setFilter(f.copyWith(feeType: () => (v == null || v.isEmpty) ? null : v)),
          ),
          const SizedBox(height: 12),
          FieldGrid(
            children: [
              DatePickerField(
                label: s.dateFrom,
                value: f.dateFrom ?? '',
                onPicked: (v) => cubit.setFilter(f.copyWith(dateFrom: () => v.isEmpty ? null : v)),
              ),
              DatePickerField(
                label: s.dateTo,
                value: f.dateTo ?? '',
                onPicked: (v) => cubit.setFilter(f.copyWith(dateTo: () => v.isEmpty ? null : v)),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            alignment: WrapAlignment.end,
            spacing: 8,
            children: [
              TextButton(onPressed: cubit.resetFilters, child: Text(s.reset)),
              FilledButton.tonal(onPressed: cubit.applyFilters, child: Text(s.apply)),
            ],
          ),
        ],
      ),
    );
  }
}

class _SummaryChips extends StatelessWidget {
  const _SummaryChips({required this.state, required this.history});

  final OtherFeesState state;
  final OtherFeeHistoryPage history;

  @override
  Widget build(BuildContext context) {
    final s = OtherFeesStrings.of(context);
    final summary = history.summary;
    return Gutter(
      vertical: 4,
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          Chip(label: Text(s.totalPaid(summary.totalPaid))),
          for (final e in summary.byType.entries) Chip(label: Text('${otherFeeTypeLabel(state, e.key)}: ৳ ${e.value}')),
        ],
      ),
    );
  }
}

class _HistoryCard extends StatelessWidget {
  const _HistoryCard({required this.state, required this.payment});

  final OtherFeesState state;
  final OtherFeePayment payment;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    final s = OtherFeesStrings.of(context);
    final theme = Theme.of(context);
    final p = payment;
    final heads = p.additionalHeads;
    final details = [
      otherFeeTypeLabel(state, p.feeType),
      if (p.feeType == 'picnic' && heads != null) s.detailsHeads(heads),
      if (p.receiptNo != null && p.receiptNo!.isNotEmpty) '${loc.memberPicnicReceiptColumn}: ${p.receiptNo}',
      if (p.paymentMethod != null && p.paymentMethod!.isNotEmpty) p.paymentMethod!,
    ].join(' · ');
    final showStatus = flagEnabled(FeatureFlag.payVerifyOtherFees);
    return AppCard(
      key: Key('otherFeesHistory_${p.id}'),
      margin: EdgeInsets.zero,
      child: Row(
        children: [
          const LeadingIcon(icon: Icons.receipt_long_outlined),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(p.paymentDate, style: theme.textTheme.titleSmall),
                Text(details, maxLines: 2, overflow: TextOverflow.ellipsis, style: theme.textTheme.bodySmall),
                if (showStatus) ...[
                  const SizedBox(height: 4),
                  StatusBadge(kind: _statusKind(p.status), label: s.status(p.status)),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text('৳ ${p.amount}', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }

  static StatusKind _statusKind(String raw) => switch (raw) {
        'pending' => StatusKind.pending,
        'rejected' => StatusKind.rejected,
        _ => StatusKind.approved,
      };
}

class _Pagination extends StatelessWidget {
  const _Pagination({required this.state, required this.cubit});

  final OtherFeesState state;
  final OtherFeesCubit cubit;

  @override
  Widget build(BuildContext context) {
    final s = OtherFeesStrings.of(context);
    final page = state.historyPage;
    final pages = state.totalPages;
    return Gutter(
      vertical: 8,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          IconButton(
            tooltip: s.previous,
            onPressed: page > 1 ? () => cubit.goToPage(page - 1) : null,
            icon: const Icon(Icons.chevron_left),
          ),
          Text(s.pageOf(page, pages)),
          IconButton(
            tooltip: s.next,
            onPressed: page < pages ? () => cubit.goToPage(page + 1) : null,
            icon: const Icon(Icons.chevron_right),
          ),
        ],
      ),
    );
  }
}
